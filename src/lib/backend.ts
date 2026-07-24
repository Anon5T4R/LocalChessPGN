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
