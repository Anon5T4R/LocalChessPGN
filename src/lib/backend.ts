/** Ponte fina com o Rust (parser de PGN). Fora do Tauri (`npm run dev` no
 *  navegador) os comandos não existem — `inTauri()` deixa a UI degradar sem
 *  quebrar (útil pro smoke visual sem empacotar o app). */
import { invoke } from "@tauri-apps/api/core";

export interface MoveNode {
  ply: number;
  san: string;
  fen: string;
  comment: string | null;
  nags: number[];
  children: MoveNode[];
}

export interface GameRecord {
  headers: [string, string][];
  startFen: string;
  startPly: number;
  root: MoveNode[];
  result: string | null;
  preambleComment: string | null;
  error: string | null;
}

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function parsePgnFile(path: string): Promise<GameRecord[]> {
  return invoke<GameRecord[]>("parse_pgn_file", { path });
}

export async function parsePgnText(text: string): Promise<GameRecord[]> {
  return invoke<GameRecord[]>("parse_pgn_text", { text });
}

export interface LegalDest {
  to: string;
  /** Casa alcançável por mais de um lance (as opções de promoção contam como
   *  UMA casa em destaque; só pergunta a peça quando precisa). */
  promotion: boolean;
}

export async function legalMovesFrom(fen: string, from: string): Promise<LegalDest[]> {
  return invoke<LegalDest[]>("legal_moves_from", { fen, from });
}

export interface AppliedMove {
  san: string;
  fen: string;
}

export async function applyMove(fen: string, from: string, to: string, promotion?: string): Promise<AppliedMove> {
  return invoke<AppliedMove>("apply_move", { fen, from, to, promotion: promotion ?? null });
}

export async function savePgnFile(path: string, games: GameRecord[]): Promise<void> {
  await invoke("save_pgn_file", { path, games });
}

export interface LibraryGameSummary {
  id: number;
  white: string;
  black: string;
  event: string;
  date: string;
  result: string;
  sourcePath: string;
}

export interface SearchHit {
  gameId: number;
  ply: number;
  white: string;
  black: string;
  event: string;
  date: string;
  result: string;
}

export interface IndexProgress {
  done: number;
  total: number;
  currentFile: string;
}

export interface AddSummary {
  gamesAdded: number;
  gamesSkipped: number;
  cancelled: boolean;
}

export async function addPgnFiles(paths: string[]): Promise<AddSummary> {
  return invoke<AddSummary>("add_pgn_files", { paths });
}

export async function cancelIndexing(): Promise<void> {
  await invoke("cancel_indexing");
}

export async function clearLibrary(): Promise<void> {
  await invoke("clear_library");
}

export async function listLibraryGames(offset: number, limit: number): Promise<LibraryGameSummary[]> {
  return invoke<LibraryGameSummary[]>("list_library_games", { offset, limit });
}

export async function openLibraryGame(id: number): Promise<GameRecord> {
  return invoke<GameRecord>("open_library_game", { id });
}

export async function removeLibraryGame(id: number): Promise<void> {
  await invoke("remove_library_game", { id });
}

export async function searchPosition(fen: string, limit: number): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_position", { fen, limit });
}
