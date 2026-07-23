/** Leitura mínima de FEN pro tabuleiro: só o suficiente pra desenhar a
 *  posição. A legalidade dos lances já foi resolvida no Rust (shakmaty) —
 *  aqui é display puro. */

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const GLYPH: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

export interface Square {
  piece: string | null; // glifo unicode, ou null se vazia
  file: number; // 0..7 = a..h
  rank: number; // 0..7 = rank 1..8
}

/** 8 linhas (rank 8 no topo, como se olha o tabuleiro das brancas) × 8 casas. */
export function boardFromFen(fen: string): Square[][] {
  const placement = (fen.split(" ")[0] ?? "").split("/");
  const rows: Square[][] = [];
  for (let r = 0; r < 8; r++) {
    const rank = 7 - r; // linha 0 do FEN = rank 8
    const row: Square[] = [];
    const line = placement[r] ?? "8".repeat(8 - placement.length + 1);
    let file = 0;
    for (const ch of line) {
      const n = Number(ch);
      if (!Number.isNaN(n)) {
        for (let k = 0; k < n && file < 8; k++) row.push({ piece: null, file: file++, rank });
      } else {
        row.push({ piece: GLYPH[ch] ?? null, file: file++, rank });
      }
    }
    while (row.length < 8) row.push({ piece: null, file: row.length, rank });
    rows.push(row);
  }
  return rows;
}

export function sideToMove(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}
