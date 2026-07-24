//! Parser de PGN → árvore de lances (linha principal + variantes).
//!
//! O modelo de árvore segue o mesmo desenho do `python-chess`: cada nó guarda
//! um ponteiro pro PAI, e uma pilha de "cursores" (`var_stack`) resolve
//! `begin_variation`/`end_variation` — abrir uma variante empurra o PAI do
//! último lance (a próxima jogada vira IRMà, não filha); fechar desempilha.
//! Cada nó já carrega o FEN da posição resultante (calculado uma vez aqui, no
//! Rust, via `shakmaty`) pra a navegação no front não precisar de ida-e-volta
//! por lance.

use std::ops::ControlFlow;

use pgn_reader::{Nag, Outcome, RawComment, RawTag, Reader, SanPlus, Skip, Visitor};
use serde::{Deserialize, Serialize};
use shakmaty::fen::Fen;
use shakmaty::{CastlingMode, Chess, Color, EnPassantMode, Position};

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MoveNode {
    pub ply: u32,
    pub san: String,
    pub fen: String,
    pub comment: Option<String>,
    pub nags: Vec<u8>,
    pub children: Vec<MoveNode>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameRecord {
    pub headers: Vec<(String, String)>,
    pub start_fen: String,
    pub start_ply: u32,
    pub root: Vec<MoveNode>,
    pub result: Option<String>,
    pub preamble_comment: Option<String>,
    /// Preenchido quando o lance é ilegal/ambíguo ou o FEN inicial é inválido.
    /// A árvore acima disto é a parte que deu pra ler antes do problema —
    /// nunca jogamos fora o que já foi parseado com sucesso.
    pub error: Option<String>,
}

impl GameRecord {
    fn broken(headers: Vec<(String, String)>, msg: String) -> GameRecord {
        GameRecord {
            headers,
            error: Some(msg),
            ..Default::default()
        }
    }
}

/// Nó durante a construção (tem a posição viva, pra computar o próximo lance).
struct BuildNode {
    pos: Chess,
    ply: u32,
    san: String,
    fen: String,
    comment: Option<String>,
    nags: Vec<u8>,
    parent: Option<usize>,
    children: Vec<usize>,
}

#[derive(Default)]
pub struct TagsAcc {
    headers: Vec<(String, String)>,
    fen: Option<String>,
}

pub struct Builder {
    headers: Vec<(String, String)>,
    start_fen: String,
    start_ply: u32,
    arena: Vec<BuildNode>,
    roots: Vec<usize>,
    /// Topo = cursor atual. `None` = posição inicial (nenhum lance ainda
    /// nesta linha); `Some(idx)` = o nó do último lance jogado nesta linha.
    var_stack: Vec<Option<usize>>,
    result: Option<String>,
    preamble_comment: Option<String>,
}

impl Builder {
    fn finish_with_error(&mut self, msg: String) -> GameRecord {
        GameRecord {
            headers: std::mem::take(&mut self.headers),
            start_fen: std::mem::take(&mut self.start_fen),
            start_ply: self.start_ply,
            root: self.roots.iter().map(|&idx| build_output(&self.arena, idx)).collect(),
            result: self.result.take(),
            preamble_comment: clean_comment(self.preamble_comment.take()),
            error: Some(msg),
        }
    }

    /// A posição inicial "de verdade" (do `[FEN]`, se houver) — reconstruída
    /// do `start_fen` guardado, já que não mantemos um `Chess` solto fora do
    /// arena. Reconstruir 1x por lance-de-abertura é barato (partida única).
    fn start_position(&self) -> Chess {
        Fen::from_ascii(self.start_fen.as_bytes())
            .expect("start_fen foi validado em begin_movetext")
            .into_position(CastlingMode::Standard)
            .expect("start_fen foi validado em begin_movetext")
    }
}

fn build_output(arena: &[BuildNode], idx: usize) -> MoveNode {
    let n = &arena[idx];
    MoveNode {
        ply: n.ply,
        san: n.san.clone(),
        fen: n.fen.clone(),
        comment: clean_comment(n.comment.clone()),
        nags: n.nags.clone(),
        children: n.children.iter().map(|&c| build_output(arena, c)).collect(),
    }
}

/// `{ comment }` preserva os espaços internos como o PGN escreveu — só as
/// pontas (formatação, não conteúdo) são aparadas aqui, uma vez só, depois de
/// já ter juntado todos os pedaços de um comentário longo (ver
/// `Visitor::comment`). Comentário vazio (`{}`, usado às vezes só como
/// separador) vira `None` em vez de uma bolha vazia no front.
fn clean_comment(s: Option<String>) -> Option<String> {
    s.and_then(|s| {
        let t = s.trim();
        if t.is_empty() { None } else { Some(t.to_string()) }
    })
}

/// Ply (meio-lance) do PRIMEIRO lance a ser jogado a partir desta posição —
/// 1 é o normal (brancas abrem); um `[FEN]` com pretas a jogar ou um número
/// de lance != 1 desloca isso, e é o que faz "1..." aparecer certo no front.
fn first_ply(pos: &Chess) -> u32 {
    let fm = pos.fullmoves().get();
    match pos.turn() {
        Color::White => (fm - 1) * 2 + 1,
        Color::Black => (fm - 1) * 2 + 2,
    }
}

struct GameVisitor;

impl Visitor for GameVisitor {
    type Tags = TagsAcc;
    type Movetext = Builder;
    type Output = GameRecord;

    fn begin_tags(&mut self) -> ControlFlow<GameRecord, TagsAcc> {
        ControlFlow::Continue(TagsAcc::default())
    }

    fn tag(&mut self, tags: &mut TagsAcc, name: &[u8], value: RawTag<'_>) -> ControlFlow<GameRecord> {
        let name_s = String::from_utf8_lossy(name).into_owned();
        let value_s = value.decode_utf8_lossy().into_owned();
        if name_s == "FEN" {
            tags.fen = Some(value_s.clone());
        }
        tags.headers.push((name_s, value_s));
        ControlFlow::Continue(())
    }

    fn begin_movetext(&mut self, tags: TagsAcc) -> ControlFlow<GameRecord, Builder> {
        let (_start_pos, start_fen, start_ply) = match &tags.fen {
            Some(fen_str) => {
                let fen = match Fen::from_ascii(fen_str.as_bytes()) {
                    Ok(f) => f,
                    Err(e) => {
                        return ControlFlow::Break(GameRecord::broken(
                            tags.headers,
                            format!("FEN inicial inválida: {e}"),
                        ));
                    }
                };
                let pos: Chess = match fen.into_position(CastlingMode::Standard) {
                    Ok(p) => p,
                    Err(e) => {
                        return ControlFlow::Break(GameRecord::broken(
                            tags.headers,
                            format!("posição inicial ilegal: {e}"),
                        ));
                    }
                };
                let ply = first_ply(&pos);
                (pos, fen_str.clone(), ply)
            }
            None => {
                let pos = Chess::default();
                let fen = Fen::from_position(&pos, EnPassantMode::Legal).to_string();
                (pos, fen, 1)
            }
        };

        ControlFlow::Continue(Builder {
            headers: tags.headers,
            start_fen,
            start_ply,
            arena: Vec::new(),
            roots: Vec::new(),
            var_stack: vec![None],
            result: None,
            preamble_comment: None,
        })
    }

    fn san(&mut self, b: &mut Builder, san_plus: SanPlus) -> ControlFlow<GameRecord> {
        let cursor = *b.var_stack.last().expect("var_stack nunca fica vazio");
        // Sem lance ainda nesta linha: reconstrói a posição inicial (respeita
        // um `[FEN]` custom); com lance, a posição já está no nó do arena.
        let pos = match cursor {
            Some(idx) => b.arena[idx].pos.clone(),
            None => b.start_position(),
        };

        let san_str = san_plus.to_string();
        let mv = match san_plus.san.to_move(&pos) {
            Ok(mv) => mv,
            Err(e) => return ControlFlow::Break(b.finish_with_error(format!("lance \"{san_str}\" inválido: {e}"))),
        };
        let new_pos = match pos.play(mv) {
            Ok(p) => p,
            Err(e) => return ControlFlow::Break(b.finish_with_error(format!("lance \"{san_str}\" ilegal: {e}"))),
        };

        let ply = match cursor {
            Some(idx) => b.arena[idx].ply + 1,
            None => b.start_ply,
        };
        let fen = Fen::from_position(&new_pos, EnPassantMode::Legal).to_string();

        let node = BuildNode {
            pos: new_pos,
            ply,
            san: san_str,
            fen,
            comment: None,
            nags: Vec::new(),
            parent: cursor,
            children: Vec::new(),
        };
        let idx = b.arena.len();
        b.arena.push(node);
        match cursor {
            None => b.roots.push(idx),
            Some(p) => b.arena[p].children.push(idx),
        }
        *b.var_stack.last_mut().unwrap() = Some(idx);
        ControlFlow::Continue(())
    }

    fn nag(&mut self, b: &mut Builder, nag: Nag) -> ControlFlow<GameRecord> {
        if let Some(idx) = *b.var_stack.last().unwrap() {
            b.arena[idx].nags.push(nag.0);
        }
        ControlFlow::Continue(())
    }

    fn comment(&mut self, b: &mut Builder, comment: RawComment<'_>) -> ControlFlow<GameRecord> {
        let text = String::from_utf8_lossy(comment.as_bytes()).into_owned();
        match *b.var_stack.last().unwrap() {
            Some(idx) => match &mut b.arena[idx].comment {
                Some(existing) => existing.push_str(&text),
                slot @ None => *slot = Some(text),
            },
            None => match &mut b.preamble_comment {
                Some(existing) => existing.push_str(&text),
                slot @ None => *slot = Some(text),
            },
        }
        ControlFlow::Continue(())
    }

    fn begin_variation(&mut self, b: &mut Builder) -> ControlFlow<GameRecord, Skip> {
        let cursor = *b.var_stack.last().unwrap();
        // Variante = alternativa ao ÚLTIMO lance da linha atual, então o
        // cursor recua pro PAI dele (a próxima san() vira irmã, não filha).
        let parent = match cursor {
            Some(idx) => b.arena[idx].parent,
            None => None,
        };
        b.var_stack.push(parent);
        ControlFlow::Continue(Skip(false))
    }

    fn end_variation(&mut self, b: &mut Builder) -> ControlFlow<GameRecord> {
        if b.var_stack.len() > 1 {
            b.var_stack.pop();
        }
        ControlFlow::Continue(())
    }

    fn outcome(&mut self, b: &mut Builder, outcome: Outcome) -> ControlFlow<GameRecord> {
        use pgn_reader::shakmaty::KnownOutcome;
        b.result = Some(match outcome {
            Outcome::Known(KnownOutcome::Decisive { winner: Color::White }) => "1-0".to_string(),
            Outcome::Known(KnownOutcome::Decisive { winner: Color::Black }) => "0-1".to_string(),
            Outcome::Known(KnownOutcome::Draw) => "1/2-1/2".to_string(),
            Outcome::Unknown => "*".to_string(),
        });
        ControlFlow::Continue(())
    }

    fn end_game(&mut self, b: Builder) -> GameRecord {
        GameRecord {
            root: b.roots.iter().map(|&idx| build_output(&b.arena, idx)).collect(),
            headers: b.headers,
            start_fen: b.start_fen,
            start_ply: b.start_ply,
            result: b.result,
            preamble_comment: clean_comment(b.preamble_comment),
            error: None,
        }
    }
}

pub(crate) fn parse_pgn_bytes(bytes: &[u8]) -> Vec<GameRecord> {
    let mut reader = Reader::new(std::io::Cursor::new(bytes));
    let mut visitor = GameVisitor;
    let mut games = Vec::new();
    loop {
        match reader.read_game(&mut visitor) {
            Ok(Some(g)) => games.push(g),
            Ok(None) => break,
            Err(e) => {
                games.push(GameRecord::broken(Vec::new(), format!("erro de E/S lendo o PGN: {e}")));
                break;
            }
        }
    }
    games
}

#[tauri::command]
pub fn parse_pgn_text(text: String) -> Vec<GameRecord> {
    parse_pgn_bytes(text.as_bytes())
}

#[tauri::command]
pub fn parse_pgn_file(path: String) -> Result<Vec<GameRecord>, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("não consegui abrir {path}: {e}"))?;
    Ok(parse_pgn_bytes(&bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_one(pgn: &str) -> GameRecord {
        let mut games = parse_pgn_bytes(pgn.as_bytes());
        assert_eq!(games.len(), 1, "esperava 1 partida, achei {}", games.len());
        games.remove(0)
    }

    #[test]
    fn fools_mate_final_fen() {
        // Mate do tolo — 4 lances, o mais curto possível.
        let g = parse_one("1. f3 e5 2. g4 Qh4# 0-1");
        assert!(g.error.is_none(), "erro inesperado: {:?}", g.error);
        assert_eq!(g.result.as_deref(), Some("0-1"));

        // Desce a linha principal até o mate.
        let mut node = &g.root[0];
        for _ in 0..3 {
            node = &node.children[0];
        }
        assert_eq!(node.san, "Qh4#");
        assert_eq!(
            node.fen,
            "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
        );
        assert_eq!(node.ply, 4);
    }

    #[test]
    fn scholars_mate_headers_and_ply() {
        let pgn = r#"[Event "Casual game"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7# 1-0
"#;
        let g = parse_one(pgn);
        assert!(g.error.is_none(), "erro inesperado: {:?}", g.error);
        assert_eq!(
            g.headers,
            vec![
                ("Event".to_string(), "Casual game".to_string()),
                ("White".to_string(), "Alice".to_string()),
                ("Black".to_string(), "Bob".to_string()),
                ("Result".to_string(), "1-0".to_string()),
            ]
        );
        assert_eq!(g.result.as_deref(), Some("1-0"));

        let mut node = &g.root[0];
        for _ in 0..6 {
            node = &node.children[0];
        }
        assert_eq!(node.san, "Qxf7#");
        assert_eq!(node.ply, 7);
        assert!(node.fen.starts_with("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR"));
    }

    #[test]
    fn variation_comment_and_nag() {
        // 1.e4 e5 2.Nf3 (2.f4!? {gambito} Nc6) 2...Nc6 * — a variante é uma
        // ALTERNATIVA ao próprio Nf3 (mesmo pai: a posição depois de 1...e5),
        // não uma continuação dele. A ramificação mora no nó ANTES do lance.
        let g = parse_one("1. e4 e5 2. Nf3 (2. f4!? { gambito } Nc6) 2... Nc6 *");
        assert!(g.error.is_none(), "erro inesperado: {:?}", g.error);

        // Linha principal: e4 -> e5 -> Nf3 -> Nc6
        let e4 = &g.root[0];
        assert_eq!(e4.san, "e4");
        let e5 = &e4.children[0];
        assert_eq!(e5.san, "e5");
        assert_eq!(e5.children.len(), 2, "e5 devia ramificar em Nf3 (mainline) e f4 (variante)");
        let nf3 = &e5.children[0];
        assert_eq!(nf3.san, "Nf3");
        assert_eq!(nf3.children.len(), 1, "Nf3 só continua na mainline (2...Nc6)");

        let mainline_nc6 = &nf3.children[0];
        assert_eq!(mainline_nc6.san, "Nc6");
        assert_eq!(mainline_nc6.ply, 4);

        let variation_f4 = &e5.children[1];
        assert_eq!(variation_f4.san, "f4");
        assert_eq!(variation_f4.nags, vec![5]); // !? = Nag::SPECULATIVE_MOVE
        assert_eq!(variation_f4.comment.as_deref(), Some("gambito"));
        assert_eq!(variation_f4.ply, 3);
        assert_eq!(variation_f4.children[0].san, "Nc6");
    }

    #[test]
    fn illegal_move_keeps_partial_tree() {
        let g = parse_one("1. e4 e5 2. Nf9 e5 *");
        assert!(g.error.is_some(), "devia ter marcado erro");
        // A parte válida (e4, e5) não é jogada fora.
        assert_eq!(g.root[0].san, "e4");
        assert_eq!(g.root[0].children[0].san, "e5");
        assert!(g.root[0].children[0].children.is_empty());
    }

    #[test]
    fn custom_fen_start_ply_black_to_move() {
        let pgn = r#"[SetUp "1"]
[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]

1... Nc6 2. Nf3 *"#;
        let g = parse_one(pgn);
        assert!(g.error.is_none(), "erro inesperado: {:?}", g.error);
        assert_eq!(g.start_ply, 2); // pretas jogam no lance 1 => ply 2
        assert_eq!(g.root[0].san, "Nc6");
        assert_eq!(g.root[0].ply, 2);
        assert_eq!(g.root[0].children[0].san, "Nf3");
        assert_eq!(g.root[0].children[0].ply, 3);
    }

    #[test]
    fn multi_game_file() {
        let games = parse_pgn_bytes(b"1. e4 e5 1/2-1/2\n\n1. d4 d5 *\n");
        assert_eq!(games.len(), 2);
        assert_eq!(games[0].result.as_deref(), Some("1/2-1/2"));
        assert_eq!(games[1].root[0].san, "d4");
    }

    // --- PGN de verdade, não gerado pelo próprio app ---------------------
    // Fixtures do `niklasf/python-chess` (mesmo autor do shakmaty/pgn-reader;
    // arquivos de teste dele são justamente PGN real com as sujeiras comuns:
    // movetext quebrado em várias linhas, linha em branco DENTRO da seção de
    // tags, BOM UTF-8, vários jogos concatenados no mesmo arquivo).

    fn mainline_last(root: &[MoveNode]) -> &MoveNode {
        let mut node = root.first().expect("partida sem nenhum lance");
        while let Some(next) = node.children.first() {
            node = next;
        }
        node
    }

    #[test]
    fn fixture_kasparov_deep_blue_multi_game_line_wrapped() {
        let pgn = include_str!("../tests/fixtures/kasparov-deep-blue-1997.pgn");
        let games = parse_pgn_bytes(pgn.as_bytes());
        // As 6 partidas do match completo (3 vitórias de Kasparov contam como
        // 1-0/1-0/1-0 alternando quem é branco; o placar real foi 3-1 com 2
        // empates — o que importa aqui é que as 6 vieram inteiras).
        assert_eq!(games.len(), 6, "o arquivo tem as 6 partidas do match de 1997");
        let expected_ply: [u32; 6] = [89, 89, 95, 111, 98, 37];
        for (i, g) in games.iter().enumerate() {
            assert!(g.error.is_none(), "partida {i}: erro inesperado: {:?}", g.error);
            assert_eq!(mainline_last(&g.root).ply, expected_ply[i], "partida {i}: PlyCount não bate");
        }
        assert_eq!(games[0].result.as_deref(), Some("1-0"));
    }

    #[test]
    fn fixture_molinari_bordais_checkmate() {
        let pgn = include_str!("../tests/fixtures/molinari-bordais-1979.pgn");
        let g = parse_one(pgn);
        assert!(g.error.is_none(), "erro inesperado: {:?}", g.error);
        assert_eq!(g.result.as_deref(), Some("0-1"));
        let last = mainline_last(&g.root);
        assert_eq!(last.san, "Nd3#");
        assert_eq!(last.ply, 10); // bate com [PlyCount "10"] do header
    }

    #[test]
    fn fixture_blank_line_inside_tag_section() {
        // "chessbase-empty-line.pgn": uma exportação real do ChessBase tem uma
        // linha em branco ENTRE [Event] e [Date] — dentro da seção de tags,
        // não entre ela e o movetext. Se o reader confundisse isso com o fim
        // dos headers, a partida sairia sem White/Black/Result nenhum.
        let pgn = include_str!("../tests/fixtures/chessbase-empty-line.pgn");
        let g = parse_one(pgn);
        assert!(g.error.is_none(), "erro inesperado: {:?}", g.error);
        assert!(g.headers.iter().any(|(k, v)| k == "White" && v == "Stockfish 8"));
        assert!(g.headers.iter().any(|(k, v)| k == "Black" && v == "AlphaZero"));
        assert_eq!(g.result.as_deref(), Some("0-1"));
        assert!(!g.root.is_empty());
    }

    #[test]
    fn fixture_utf8_bom_and_real_elite_game() {
        let pgn_bytes = include_bytes!("../tests/fixtures/utf8-bom.pgn");
        assert!(pgn_bytes.starts_with(b"\xef\xbb\xbf"), "fixture perdeu o BOM");
        let games = parse_pgn_bytes(pgn_bytes);
        assert_eq!(games.len(), 2, "duas partidas VAZIAS (PlyCount 0), separadas por uma em branco");
        for g in &games {
            assert!(g.error.is_none(), "erro inesperado: {:?}", g.error);
            assert!(g.root.is_empty());
            assert_eq!(g.result.as_deref(), Some("*"));
        }

        let pgn = include_str!("../tests/fixtures/nepomniachtchi-liren-game1.pgn");
        let g = parse_one(pgn);
        assert!(g.error.is_none(), "erro inesperado: {:?}", g.error);
        assert_eq!(g.result.as_deref(), Some("1/2-1/2"));
        let last = mainline_last(&g.root);
        assert_eq!(last.san, "Ke3");
        assert_eq!(last.ply, 97); // lance 49 das brancas
    }
}
