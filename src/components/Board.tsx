import { boardFromFen } from "../lib/fen";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export default function Board({ fen }: { fen: string }) {
  const rows = boardFromFen(fen);
  return (
    <div className="board" role="img" aria-label={`Tabuleiro: ${fen}`}>
      {rows.map((row) =>
        row.map((sq) => {
          const dark = (sq.file + sq.rank) % 2 === 0;
          const isEdgeRank = sq.file === 0;
          const isEdgeFile = sq.rank === 0;
          return (
            <div key={`${sq.file}-${sq.rank}`} className={`sq ${dark ? "dark" : "light"}`}>
              {isEdgeRank && <span className="sq-coord sq-coord-rank">{sq.rank + 1}</span>}
              {isEdgeFile && <span className="sq-coord sq-coord-file">{FILES[sq.file]}</span>}
              {sq.piece && <span className="sq-piece">{sq.piece}</span>}
            </div>
          );
        }),
      )}
    </div>
  );
}
