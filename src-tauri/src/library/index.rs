use std::sync::atomic::{AtomicBool, Ordering};

use rusqlite::{params, Transaction};
use serde::Serialize;
use shakmaty::fen::Fen;
use shakmaty::zobrist::Zobrist64;
use shakmaty::{CastlingMode, Chess, EnPassantMode, Position};
use tauri::{AppHandle, Emitter, State};

use crate::pgn::{parse_pgn_bytes, GameRecord, MoveNode};
use crate::write::to_pgn;

use super::db::Db;

/// Sinaliza um "add_pgn_files" em andamento pra parar entre um arquivo e o
/// próximo — indexar é operação longa e visível (§4 do plano), então precisa
/// de saída honesta, não só barra de progresso sem controle nenhum.
#[derive(Default)]
pub struct IndexCancel(pub AtomicBool);

pub(super) fn zobrist_of_fen(fen: &str) -> Result<i64, String> {
    let pos: Chess = Fen::from_ascii(fen.as_bytes())
        .map_err(|e| format!("FEN inválida no índice: {e}"))?
        .into_position(CastlingMode::Standard)
        .map_err(|e| format!("posição ilegal no índice: {e}"))?;
    let z: Zobrist64 = pos.zobrist_hash(EnPassantMode::Legal);
    // SQLite INTEGER é i64; reinterpretar os mesmos 64 bits preserva a
    // igualdade (é tudo que a busca precisa — não fazemos range query).
    Ok(z.0 as i64)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn header(game: &GameRecord, key: &str) -> String {
    game.headers.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone()).unwrap_or_default()
}

fn index_node(tx: &Transaction, game_id: i64, node: &MoveNode) -> Result<(), String> {
    let hash = zobrist_of_fen(&node.fen)?;
    tx.execute("INSERT OR IGNORE INTO pos (hash, game, ply) VALUES (?1,?2,?3)", params![hash, game_id, node.ply])
        .map_err(|e| e.to_string())?;
    // Indexa a árvore INTEIRA — mainline e variantes — porque "passou por
    // ali" inclui análise, não só a linha que foi de fato jogada.
    for child in &node.children {
        index_node(tx, game_id, child)?;
    }
    Ok(())
}

pub(crate) fn insert_game(tx: &Transaction, source_path: &str, game: &GameRecord) -> Result<i64, String> {
    let pgn_text = to_pgn(game);
    tx.execute(
        "INSERT INTO games (source_path, pgn, white, black, event, date, result, added_ms)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![
            source_path,
            pgn_text,
            header(game, "White"),
            header(game, "Black"),
            header(game, "Event"),
            header(game, "Date"),
            game.result.clone().unwrap_or_else(|| "*".to_string()),
            now_ms(),
        ],
    )
    .map_err(|e| e.to_string())?;
    let game_id = tx.last_insert_rowid();

    // Posição de abertura também entra — "achar partidas que passaram pela
    // posição inicial" é um caso de uso real (posições de estudo/tablebase).
    let start_ply = game.start_ply.saturating_sub(1);
    let start_hash = zobrist_of_fen(&game.start_fen)?;
    tx.execute("INSERT OR IGNORE INTO pos (hash, game, ply) VALUES (?1,?2,?3)", params![start_hash, game_id, start_ply])
        .map_err(|e| e.to_string())?;

    for node in &game.root {
        index_node(tx, game_id, node)?;
    }
    Ok(game_id)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IndexProgress {
    pub done: u32,
    pub total: u32,
    pub current_file: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddSummary {
    pub games_added: u32,
    pub games_skipped: u32,
    pub cancelled: bool,
}

#[tauri::command]
pub fn add_pgn_files(
    app: AppHandle,
    db: State<Db>,
    cancel: State<IndexCancel>,
    paths: Vec<String>,
) -> Result<AddSummary, String> {
    cancel.0.store(false, Ordering::SeqCst);

    let total = paths.len() as u32;
    let mut added = 0u32;
    let mut skipped = 0u32;

    let mut guard = db.0.lock().map_err(|_| "banco indisponível".to_string())?;
    let conn = guard.as_mut().ok_or_else(|| "banco não inicializado".to_string())?;

    for (i, path) in paths.iter().enumerate() {
        if cancel.0.load(Ordering::SeqCst) {
            return Ok(AddSummary { games_added: added, games_skipped: skipped, cancelled: true });
        }
        let _ = app.emit("library-index-progress", IndexProgress { done: i as u32, total, current_file: path.clone() });

        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        let games = parse_pgn_bytes(&bytes);
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for g in &games {
            if g.error.is_some() {
                skipped += 1;
                continue;
            }
            match insert_game(&tx, path, g) {
                Ok(_) => added += 1,
                Err(_) => skipped += 1,
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    let _ = app.emit("library-index-progress", IndexProgress { done: total, total, current_file: String::new() });
    Ok(AddSummary { games_added: added, games_skipped: skipped, cancelled: false })
}

#[tauri::command]
pub fn cancel_indexing(cancel: State<IndexCancel>) -> Result<(), String> {
    cancel.0.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn clear_library(db: State<Db>) -> Result<(), String> {
    let guard = db.0.lock().map_err(|_| "banco indisponível".to_string())?;
    let conn = guard.as_ref().ok_or_else(|| "banco não inicializado".to_string())?;
    conn.execute_batch("DELETE FROM games; DELETE FROM pos;").map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::db::open_in_memory_for_tests;

    fn index_pgn(conn: &mut rusqlite::Connection, path: &str, pgn: &str) -> Vec<i64> {
        let games = parse_pgn_bytes(pgn.as_bytes());
        let tx = conn.transaction().unwrap();
        let mut ids = Vec::new();
        for g in &games {
            assert!(g.error.is_none(), "fixture quebrada: {:?}", g.error);
            ids.push(insert_game(&tx, path, g).unwrap());
        }
        tx.commit().unwrap();
        ids
    }

    #[test]
    fn zobrist_matches_shakmaty_doctest_value() {
        // O próprio shakmaty documenta esse valor pra posição inicial —
        // conferindo aqui em vez de confiar de memória.
        let start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        assert_eq!(zobrist_of_fen(start_fen).unwrap(), 0x463b96181691fc9cu64 as i64);
    }

    #[test]
    fn indexes_start_position_and_every_node_including_variations() {
        let mut conn = open_in_memory_for_tests();
        let pgn = "1. e4 e5 2. Nf3 (2. f4 Nc6) 2... Nc6 *";
        let ids = index_pgn(&mut conn, "mem.pgn", pgn);
        assert_eq!(ids.len(), 1);

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM pos WHERE game = ?1", [ids[0]], |r| r.get(0)).unwrap();
        // início + e4 + e5 + Nf3 + f4(variante) + Nc6(mainline) + Nc6(variante) = 7
        assert_eq!(count, 7);

        let start_hash = zobrist_of_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").unwrap();
        let start_ply: i64 = conn
            .query_row("SELECT ply FROM pos WHERE game = ?1 AND hash = ?2", rusqlite::params![ids[0], start_hash], |r| r.get(0))
            .unwrap();
        assert_eq!(start_ply, 0);
    }

    #[test]
    fn real_fixture_indexes_without_error() {
        let mut conn = open_in_memory_for_tests();
        let pgn = include_str!("../../tests/fixtures/kasparov-deep-blue-1997.pgn");
        let ids = index_pgn(&mut conn, "kasparov.pgn", pgn);
        assert_eq!(ids.len(), 6);
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM pos", [], |r| r.get(0)).unwrap();
        assert!(total > 500, "esperava várias centenas de posições, veio {total}");
    }
}
