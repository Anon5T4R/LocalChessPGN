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
