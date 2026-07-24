//! Jogar um lance a partir de um FEN — sem estado, sem árvore: a árvore de
//! variantes é responsabilidade do front (ele já tem o `GameRecord` inteiro
//! carregado). Aqui só entra "essa jogada é legal, e que SAN/FEN ela dá".

use std::collections::BTreeMap;
use std::str::FromStr;

use serde::Serialize;
use shakmaty::fen::Fen;
use shakmaty::san::San;
use shakmaty::{CastlingMode, Chess, EnPassantMode, File, Move, Position, Role, Square};

pub(crate) fn position_from_fen(fen: &str) -> Result<Chess, String> {
    Fen::from_ascii(fen.as_bytes())
        .map_err(|e| format!("FEN inválida: {e}"))?
        .into_position(CastlingMode::Standard)
        .map_err(|e| format!("posição inicial ilegal: {e}"))
}

/// O `to()` do shakmaty devolve a casa da TORRE pro roque (representação
/// interna "rei come torre", compatível com Chess960). Pra UI (clicar/
/// destacar onde o REI visualmente pousa) precisamos de g1/c1/g8/c8.
fn visual_to(m: &Move) -> Square {
    match *m {
        Move::Castle { king, rook } => {
            let kingside = rook.file() > king.file();
            Square::from_coords(if kingside { File::G } else { File::C }, king.rank())
        }
        _ => m.to(),
    }
}

/// `from()` já dá a casa do rei pro roque — essa é visualmente correta.
fn visual_from(m: &Move) -> Option<Square> {
    match *m {
        Move::Normal { from, .. } | Move::EnPassant { from, .. } => Some(from),
        Move::Castle { king, .. } => Some(king),
        Move::Put { .. } => None,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegalDest {
    pub to: String,
    /// Casa alcançável por mais de um lance (as 4 opções de promoção contam
    /// como UMA casa em destaque; o front pergunta a peça só quando precisa).
    pub promotion: bool,
}

#[tauri::command]
pub fn legal_moves_from(fen: String, from: String) -> Result<Vec<LegalDest>, String> {
    let pos = position_from_fen(&fen)?;
    let from_sq = Square::from_str(&from).map_err(|_| format!("casa inválida: {from}"))?;

    let mut by_to: BTreeMap<Square, bool> = BTreeMap::new();
    for m in pos.legal_moves() {
        if visual_from(&m) != Some(from_sq) {
            continue;
        }
        let promo = matches!(m, Move::Normal { promotion: Some(_), .. });
        let entry = by_to.entry(visual_to(&m)).or_insert(false);
        *entry = *entry || promo;
    }

    Ok(by_to
        .into_iter()
        .map(|(to, promotion)| LegalDest { to: to.to_string(), promotion })
        .collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedMove {
    pub san: String,
    pub fen: String,
}

#[tauri::command]
pub fn apply_move(fen: String, from: String, to: String, promotion: Option<String>) -> Result<AppliedMove, String> {
    let pos = position_from_fen(&fen)?;
    let from_sq = Square::from_str(&from).map_err(|_| format!("casa inválida: {from}"))?;
    let to_sq = Square::from_str(&to).map_err(|_| format!("casa inválida: {to}"))?;
    let promo_role = match promotion {
        Some(s) => Some(
            Role::from_char(s.chars().next().unwrap_or('\0'))
                .ok_or_else(|| format!("peça de promoção inválida: {s}"))?,
        ),
        None => None,
    };

    let candidates: Vec<Move> = pos
        .legal_moves()
        .into_iter()
        .filter(|m| visual_from(m) == Some(from_sq) && visual_to(m) == to_sq)
        .filter(|m| match m {
            Move::Normal { promotion: p, .. } => *p == promo_role,
            _ => true,
        })
        .collect();

    let mv = match candidates.as_slice() {
        [one] => *one,
        [] => return Err("lance ilegal".to_string()),
        _ => return Err("lance ambíguo — falta escolher a peça de promoção".to_string()),
    };

    let san = San::from_move(&pos, mv).to_string();
    let new_pos = pos.play(mv).map_err(|e| format!("lance ilegal: {e:?}"))?;
    let fen_out = Fen::from_position(&new_pos, EnPassantMode::Legal).to_string();
    Ok(AppliedMove { san, fen: fen_out })
}

#[cfg(test)]
mod tests {
    use super::*;

    const START: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    #[test]
    fn knight_from_g1_at_start() {
        let dests = legal_moves_from(START.to_string(), "g1".to_string()).unwrap();
        let mut tos: Vec<String> = dests.into_iter().map(|d| d.to).collect();
        tos.sort();
        assert_eq!(tos, vec!["f3".to_string(), "h3".to_string()]);
    }

    #[test]
    fn empty_square_has_no_moves() {
        let dests = legal_moves_from(START.to_string(), "e4".to_string()).unwrap();
        assert!(dests.is_empty());
    }

    #[test]
    fn apply_e4() {
        let r = apply_move(START.to_string(), "e2".to_string(), "e4".to_string(), None).unwrap();
        assert_eq!(r.san, "e4");
        // Sem `e3`: `EnPassantMode::Legal` só marca a casa quando a captura
        // en passant é de fato POSSÍVEL agora — não há peão preto do lado
        // pra fazê-la, então fica "-" (mesma convenção do parser em pgn.rs).
        assert_eq!(r.fen, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    }

    #[test]
    fn illegal_move_rejected() {
        let r = apply_move(START.to_string(), "e2".to_string(), "e5".to_string(), None);
        assert!(r.is_err());
    }

    #[test]
    fn castle_kingside_visual_square() {
        // Posição com blancas prontas pra roque curto.
        let fen = "rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
        let dests = legal_moves_from(fen.to_string(), "e1".to_string()).unwrap();
        assert!(dests.iter().any(|d| d.to == "g1"), "esperava g1 (roque curto) entre os destinos de e1");
        let r = apply_move(fen.to_string(), "e1".to_string(), "g1".to_string(), None).unwrap();
        assert_eq!(r.san, "O-O");
    }

    #[test]
    fn promotion_needs_disambiguation() {
        let fen = "8/4P1k1/8/8/8/8/6K1/8 w - - 0 1";
        let dests = legal_moves_from(fen.to_string(), "e7".to_string()).unwrap();
        let e8 = dests.iter().find(|d| d.to == "e8").expect("e8 devia estar nos destinos");
        assert!(e8.promotion, "e8 exige escolher a peça");

        let ambiguous = apply_move(fen.to_string(), "e7".to_string(), "e8".to_string(), None);
        assert!(ambiguous.is_err(), "sem escolher a peça, o lance é ambíguo");

        let queened = apply_move(fen.to_string(), "e7".to_string(), "e8".to_string(), Some("q".to_string())).unwrap();
        // Sem xeque: dama em e8 não ataca g7 em linha reta nem diagonal.
        assert_eq!(queened.san, "e8=Q");
    }
}
