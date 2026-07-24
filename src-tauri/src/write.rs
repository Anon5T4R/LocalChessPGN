//! `GameRecord` → texto PGN. O inverso do `pgn::parse_pgn_bytes` — testado
//! por ROUND-TRIP (parse → serializa → reparse → compara), não só lendo o
//! texto gerado com os próprios olhos.

use crate::pgn::{GameRecord, MoveNode};

fn escape_tag_value(v: &str) -> String {
    v.replace('\\', "\\\\").replace('"', "\\\"")
}

/// `}` fecharia o comentário mais cedo — a única coisa que precisa escapar,
/// já que o resto (inclusive quebra de linha) é válido dentro de `{ }`.
fn sanitize_comment(c: &str) -> String {
    c.replace('}', ")")
}

/// Escreve `node` e sua continuação. `siblings` são as variantes DESTE lance
/// (alternativas a `node`, não ao que vem depois dele) — o chamador as
/// recebe olhando os OUTROS filhos do pai de `node`, porque é ali que elas
/// moram na árvore. Em PGN a variante vem colada logo depois do lance que
/// ela substitui e ANTES da continuação da linha principal desse lance —
/// inverter a ordem gera `(2. f4 …)` antes de `2. Nf3`, e reabrir isso tenta
/// jogar "f4" na posição de ANTES do Nf3, lance ilegal (achado por round-trip).
fn write_node(node: &MoveNode, siblings: &[MoveNode], force_number: bool, out: &mut String) {
    out.push(' ');
    let is_white = node.ply % 2 == 1;
    if is_white || force_number {
        out.push_str(&((node.ply + 1) / 2).to_string());
        out.push_str(if is_white { "." } else { "..." });
        out.push(' ');
    }
    out.push_str(&node.san);
    for &n in &node.nags {
        out.push_str(&format!(" ${n}"));
    }
    if let Some(c) = &node.comment {
        out.push_str(" {");
        out.push_str(&sanitize_comment(c));
        out.push('}');
    }

    for variation in siblings {
        out.push_str(" (");
        write_node(variation, &[], true, out);
        out.push(')');
    }
    let force_next = node.comment.is_some() || !siblings.is_empty();
    if let Some(mainline) = node.children.first() {
        write_node(mainline, &node.children[1..], force_next, out);
    }
}

pub fn to_pgn(game: &GameRecord) -> String {
    let mut out = String::new();
    for (k, v) in &game.headers {
        out.push('[');
        out.push_str(k);
        out.push_str(" \"");
        out.push_str(&escape_tag_value(v));
        out.push_str("\"]\n");
    }
    out.push('\n');

    let mut body = String::new();
    if let Some(pre) = &game.preamble_comment {
        body.push('{');
        body.push_str(&sanitize_comment(pre));
        body.push('}');
    }
    if let Some(first) = game.root.first() {
        // Variantes já no PRIMEIRO lance (raro, mas a árvore permite) são os
        // outros elementos de `root` — mesmo tratamento de `siblings`.
        write_node(first, &game.root[1..], true, &mut body);
    }
    body.push(' ');
    body.push_str(game.result.as_deref().unwrap_or("*"));

    out.push_str(body.trim_start());
    out.push('\n');
    out
}

#[tauri::command]
pub fn save_pgn_file(path: String, games: Vec<GameRecord>) -> Result<(), String> {
    let mut content = String::new();
    for (i, g) in games.iter().enumerate() {
        if i > 0 {
            content.push('\n');
        }
        content.push_str(&to_pgn(g));
    }

    // Grava atômico: escreve num arquivo à parte e só troca de nome no fim,
    // pra uma falha no meio do caminho nunca deixar o PGN do usuário
    // truncado/corrompido (lição paga no OpenObsidian).
    let tmp_path = format!("{path}.tmp");
    std::fs::write(&tmp_path, &content).map_err(|e| format!("não consegui escrever {tmp_path}: {e}"))?;
    std::fs::rename(&tmp_path, &path).map_err(|e| format!("não consegui salvar em {path}: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pgn::parse_pgn_bytes;

    fn roundtrip(pgn: &str) -> (GameRecord, GameRecord) {
        let original = parse_pgn_bytes(pgn.as_bytes()).remove(0);
        assert!(original.error.is_none(), "fixture de entrada já vem quebrada: {:?}", original.error);
        let written = to_pgn(&original);
        let reparsed = parse_pgn_bytes(written.as_bytes()).remove(0);
        assert!(reparsed.error.is_none(), "PGN escrito não reabre: {:?}\n---\n{written}", reparsed.error);
        (original, reparsed)
    }

    #[test]
    fn roundtrip_headers_and_result() {
        let pgn = "[Event \"Casual\"]\n[White \"Alice\"]\n[Black \"Bob\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7# 1-0\n";
        let (a, b) = roundtrip(pgn);
        assert_eq!(a.headers, b.headers);
        assert_eq!(a.result, b.result);
        assert_eq!(a.root[0].fen, b.root[0].fen);
    }

    #[test]
    fn roundtrip_variation_comment_nag() {
        let pgn = "1. e4 e5 2. Nf3 (2. f4!? { Gambito do rei. } Nc6) 2... Nc6 3. Bb5 a6 4. Ba4 *";
        let (a, b) = roundtrip(pgn);
        // Mesma FORMA de árvore, comparada nó a nó até a folha de cada ramo.
        fn last_san(g: &GameRecord, path: &[usize]) -> String {
            let mut node = &g.root[path[0]];
            for &i in &path[1..] {
                node = &node.children[i];
            }
            node.san.clone()
        }
        assert_eq!(last_san(&a, &[0, 0, 0, 0, 0, 0]), last_san(&b, &[0, 0, 0, 0, 0, 0])); // Ba4
        assert_eq!(a.root[0].children[0].children[1].san, b.root[0].children[0].children[1].san); // f4
        assert_eq!(a.root[0].children[0].children[1].nags, b.root[0].children[0].children[1].nags);
        assert_eq!(a.root[0].children[0].children[1].comment, b.root[0].children[0].children[1].comment);
        assert_eq!(a.root[0].children[0].children[1].children[0].san, b.root[0].children[0].children[1].children[0].san);
    }

    #[test]
    fn roundtrip_real_fixture_kasparov() {
        let pgn = include_str!("../tests/fixtures/kasparov-deep-blue-1997.pgn");
        let games = parse_pgn_bytes(pgn.as_bytes());
        for g in &games {
            assert!(g.error.is_none());
            let written = to_pgn(g);
            let reparsed_all = parse_pgn_bytes(written.as_bytes());
            assert_eq!(reparsed_all.len(), 1);
            let reparsed = &reparsed_all[0];
            assert!(reparsed.error.is_none(), "não reabriu: {:?}", reparsed.error);
            assert_eq!(g.result, reparsed.result);
            // FEN final bate — prova que a linha inteira sobreviveu ao round-trip.
            fn last_fen(n: &MoveNode) -> &str {
                match n.children.first() {
                    Some(c) => last_fen(c),
                    None => &n.fen,
                }
            }
            assert_eq!(last_fen(&g.root[0]), last_fen(&reparsed.root[0]));
        }
    }

    #[test]
    fn comment_with_closing_brace_is_sanitized() {
        let mut game = GameRecord::default();
        game.result = Some("*".to_string());
        game.root.push(MoveNode {
            ply: 1,
            san: "e4".to_string(),
            fen: "x".to_string(),
            comment: Some("perigoso } aqui".to_string()),
            nags: vec![],
            children: vec![],
        });
        let text = to_pgn(&game);
        assert!(!text.contains("perigoso } aqui"), "a chave interna tinha que sumir");
        // E o resultado ainda reabre.
        let reparsed = parse_pgn_bytes(text.as_bytes());
        assert_eq!(reparsed.len(), 1);
        assert!(reparsed[0].error.is_none());
    }
}
