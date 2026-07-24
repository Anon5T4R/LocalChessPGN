use std::sync::Mutex;

use rusqlite::Connection;

/// `Mutex<Option<Connection>>` porque o caminho real (app_data_dir) só existe
/// depois do `.setup()` do Tauri — mesmo padrão do LocalFeed (`db.rs`/`lib.rs`).
pub struct Db(pub Mutex<Option<Connection>>);

pub fn open(path: &std::path::Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode = WAL;").map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

/// `pub(crate)` — os testes deste módulo montam bancos em memória com o
/// mesmo schema, sem duplicar o SQL.
pub(crate) fn migrate(conn: &Connection) -> Result<(), String> {
    let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if v < 1 {
        conn.execute_batch(
            "CREATE TABLE games (
               id INTEGER PRIMARY KEY,
               source_path TEXT NOT NULL,
               pgn TEXT NOT NULL,
               white TEXT NOT NULL DEFAULT '',
               black TEXT NOT NULL DEFAULT '',
               event TEXT NOT NULL DEFAULT '',
               date TEXT NOT NULL DEFAULT '',
               result TEXT NOT NULL DEFAULT '*',
               added_ms INTEGER NOT NULL
             );
             CREATE TABLE pos (
               hash INTEGER NOT NULL,
               game INTEGER NOT NULL,
               ply INTEGER NOT NULL,
               PRIMARY KEY (hash, game, ply)
             ) WITHOUT ROWID;
             CREATE INDEX pos_game ON pos(game);
             PRAGMA user_version = 1;",
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
pub(crate) fn open_in_memory_for_tests() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    migrate(&conn).unwrap();
    conn
}
