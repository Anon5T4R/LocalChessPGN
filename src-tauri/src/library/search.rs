use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;

use crate::pgn::GameRecord;

use super::db::Db;
use super::index::zobrist_of_fen;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryGameSummary {
    pub id: i64,
    pub white: String,
    pub black: String,
    pub event: String,
    pub date: String,
    pub result: String,
    pub source_path: String,
}

fn list_library_games_impl(conn: &Connection, offset: i64, limit: i64) -> Result<Vec<LibraryGameSummary>, String> {
    let mut stmt = conn
        .prepare("SELECT id, white, black, event, date, result, source_path FROM games ORDER BY id DESC LIMIT ?1 OFFSET ?2")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit, offset], |r| {
            Ok(LibraryGameSummary {
                id: r.get(0)?,
                white: r.get(1)?,
                black: r.get(2)?,
                event: r.get(3)?,
                date: r.get(4)?,
                result: r.get(5)?,
                source_path: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_library_games(db: State<Db>, offset: i64, limit: i64) -> Result<Vec<LibraryGameSummary>, String> {
    let guard = db.0.lock().map_err(|_| "banco indisponível".to_string())?;
    let conn = guard.as_ref().ok_or_else(|| "banco não inicializado".to_string())?;
    list_library_games_impl(conn, offset, limit)
}

fn open_library_game_impl(conn: &Connection, id: i64) -> Result<GameRecord, String> {
    let pgn: String = conn
        .query_row("SELECT pgn FROM games WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|e| format!("partida {id} não encontrada: {e}"))?;
    let mut games = crate::pgn::parse_pgn_bytes(pgn.as_bytes());
    if games.is_empty() {
        return Err(format!("partida {id} veio vazia do banco"));
    }
    Ok(games.remove(0))
}

#[tauri::command]
pub fn open_library_game(db: State<Db>, id: i64) -> Result<GameRecord, String> {
    let guard = db.0.lock().map_err(|_| "banco indisponível".to_string())?;
    let conn = guard.as_ref().ok_or_else(|| "banco não inicializado".to_string())?;
    open_library_game_impl(conn, id)
}

fn remove_library_game_impl(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM games WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM pos WHERE game = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_library_game(db: State<Db>, id: i64) -> Result<(), String> {
    let guard = db.0.lock().map_err(|_| "banco indisponível".to_string())?;
    let conn = guard.as_ref().ok_or_else(|| "banco não inicializado".to_string())?;
    remove_library_game_impl(conn, id)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub game_id: i64,
    pub ply: u32,
    pub white: String,
    pub black: String,
    pub event: String,
    pub date: String,
    pub result: String,
}

fn search_position_impl(conn: &Connection, fen: &str, limit: i64) -> Result<Vec<SearchHit>, String> {
    let hash = zobrist_of_fen(fen)?;
    let mut stmt = conn
        .prepare(
            "SELECT g.id, p.ply, g.white, g.black, g.event, g.date, g.result
             FROM pos p JOIN games g ON g.id = p.game
             WHERE p.hash = ?1
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![hash, limit], |r| {
            Ok(SearchHit {
                game_id: r.get(0)?,
                ply: r.get(1)?,
                white: r.get(2)?,
                black: r.get(3)?,
                event: r.get(4)?,
                date: r.get(5)?,
                result: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_position(db: State<Db>, fen: String, limit: i64) -> Result<Vec<SearchHit>, String> {
    let guard = db.0.lock().map_err(|_| "banco indisponível".to_string())?;
    let conn = guard.as_ref().ok_or_else(|| "banco não inicializado".to_string())?;
    search_position_impl(conn, &fen, limit)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::db::open_in_memory_for_tests;
    use crate::library::index::insert_game;
    use crate::pgn::parse_pgn_bytes;

    fn seed(conn: &mut Connection, path: &str, pgn: &str) -> Vec<i64> {
        let games = parse_pgn_bytes(pgn.as_bytes());
        let tx = conn.transaction().unwrap();
        let ids = games
            .iter()
            .map(|g| {
                assert!(g.error.is_none(), "fixture quebrada: {:?}", g.error);
                insert_game(&tx, path, g).unwrap()
            })
            .collect();
        tx.commit().unwrap();
        ids
    }

    #[test]
    fn search_finds_transposition() {
        // 1.e4 e5 2.Nf3 e 1.Nf3 e5 2.e4 chegam na MESMA posição por ordens
        // diferentes de lances — a busca é por HASH DE POSIÇÃO, não por
        // prefixo de movetext, e tem que achar as duas.
        let mut conn = open_in_memory_for_tests();
        seed(&mut conn, "a.pgn", "[White \"A1\"]\n[Black \"A2\"]\n\n1. e4 e5 2. Nf3 *");
        seed(&mut conn, "b.pgn", "[White \"B1\"]\n[Black \"B2\"]\n\n1. Nf3 e5 2. e4 *");

        let after_transposition = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
        let hits = search_position_impl(&conn, after_transposition, 10).unwrap();
        let whites: std::collections::HashSet<_> = hits.iter().map(|h| h.white.clone()).collect();
        assert_eq!(hits.len(), 2, "as duas ordens de lance chegam na mesma posição");
        assert!(whites.contains("A1") && whites.contains("B1"));
    }

    #[test]
    fn search_respects_limit() {
        let mut conn = open_in_memory_for_tests();
        for i in 0..5 {
            seed(&mut conn, "many.pgn", &format!("[White \"P{i}\"]\n\n1. e4 *"));
        }
        let after_e4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
        let hits = search_position_impl(&conn, after_e4, 3).unwrap();
        assert_eq!(hits.len(), 3, "LIMIT tem que cortar — posição comum não pode devolver tudo");
    }

    #[test]
    fn list_and_open_and_remove() {
        let mut conn = open_in_memory_for_tests();
        let ids = seed(&mut conn, "a.pgn", "[White \"Alice\"]\n[Black \"Bob\"]\n[Result \"1-0\"]\n\n1. e4 e5 1-0");

        let listed = list_library_games_impl(&conn, 0, 10).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].white, "Alice");

        let reopened = open_library_game_impl(&conn, ids[0]).unwrap();
        assert_eq!(reopened.root[0].san, "e4");
        assert_eq!(reopened.result.as_deref(), Some("1-0"));

        remove_library_game_impl(&conn, ids[0]).unwrap();
        assert!(list_library_games_impl(&conn, 0, 10).unwrap().is_empty());
        let left_in_pos: i64 = conn.query_row("SELECT COUNT(*) FROM pos WHERE game = ?1", params![ids[0]], |r| r.get(0)).unwrap();
        assert_eq!(left_in_pos, 0, "remover a partida tem que limpar o índice de posições junto");
    }
}
