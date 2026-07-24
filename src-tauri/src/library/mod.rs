//! Base de partidas que o usuário aponta (não é catálogo embutido) + índice
//! de posições pra busca por FEN. Design medido em `docs/planos/localchesspgn.md`
//! §4: SQLite `WITHOUT ROWID`, Zobrist 64 bits do próprio `shakmaty`
//! (compatível com Polyglot), `EnPassantMode::Legal`. **O índice é 100%
//! derivado** — some e reconstrói, nunca migra (mesma regra do LocalFeed).

mod db;
// `pub(crate)` — o `tauri::generate_handler!` precisa do caminho ORIGINAL
// do módulo onde a função é definida (o `#[tauri::command]` gera itens
// auxiliares ao lado dela; um `pub use` só traz o nome, não os auxiliares).
pub(crate) mod index;
pub(crate) mod search;

pub use db::{open as open_db, Db};
pub use index::IndexCancel;
