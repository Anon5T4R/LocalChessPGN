import type { LegalDest } from "../lib/backend";
import { boardFromFen, squareName } from "../lib/fen";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

interface Props {
  fen: string;
  selectedSquare?: string | null;
  legalDests?: LegalDest[];
  onSquareClick?: (square: string) => void;
}

export default function Board({ fen, selectedSquare, legalDests, onSquareClick }: Props) {
  const rows = boardFromFen(fen);
  const destSet = new Set((legalDests ?? []).map((d) => d.to));
  return (
    <div className="board" role="img" aria-label={`Tabuleiro: ${fen}`}>
      {rows.map((row) =>
        row.map((sq) => {
          const name = squareName(sq.file, sq.rank);
          const dark = (sq.file + sq.rank) % 2 === 0;
          const isEdgeRank = sq.file === 0;
          const isEdgeFile = sq.rank === 0;
          const isSelected = selectedSquare === name;
          const isDest = destSet.has(name);
          const classes = ["sq", dark ? "dark" : "light"];
          if (isSelected) classes.push("sq-selected");
          if (isDest) classes.push("sq-dest");
          return (
            <div
              key={name}
              className={classes.join(" ")}
              onClick={onSquareClick ? () => onSquareClick(name) : undefined}
            >
              {isEdgeRank && <span className="sq-coord sq-coord-rank">{sq.rank + 1}</span>}
              {isEdgeFile && <span className="sq-coord sq-coord-file">{FILES[sq.file]}</span>}
              {sq.piece && <span className="sq-piece">{sq.piece}</span>}
              {isDest && <span className="sq-dest-dot" />}
            </div>
          );
        }),
      )}
    </div>
  );
}
