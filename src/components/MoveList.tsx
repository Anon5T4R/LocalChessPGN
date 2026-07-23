import { Fragment } from "react";
import type { ReactNode } from "react";
import type { GameRecord, MoveNode } from "../lib/backend";
import { nagGlyph } from "../lib/nag";
import { samePath, type Path } from "../lib/tree";
import { t } from "../lib/i18n";

interface Props {
  game: GameRecord;
  path: Path;
  onSelect: (p: Path) => void;
}

function MoveNumberLabel({ ply }: { ply: number }) {
  const num = Math.ceil(ply / 2);
  const isWhite = ply % 2 === 1;
  return <span className="mv-num">{num}{isWhite ? "." : "…"} </span>;
}

/** Um lance + (se houver) variantes penduradas nele + a continuação da
 *  linha (`children[0]`) — tudo em sequência "flat" pra fluir como texto. O
 *  ponto de ramificação mora no lance ANTERIOR (mesmo pai), não neste nó: um
 *  nó com 2+ filhos significa "depois de mim, mainline OU variante". */
function renderNode(node: MoveNode, path: Path, selected: Path, onSelect: (p: Path) => void, forceNumber: boolean): ReactNode[] {
  const key = path.join(".");
  const isSel = samePath(path, selected);
  // Espaço de verdade (nó de texto), não só CSS — senão o textContent (cópia,
  // leitor de tela) cola os lances um no outro ("e4e5").
  const out: ReactNode[] = [
    " ",
    <span
      key={key}
      className={`mv${isSel ? " mv-selected" : ""}`}
      onClick={() => onSelect(path)}
      title={node.fen}
    >
      {(node.ply % 2 === 1 || forceNumber) && <MoveNumberLabel ply={node.ply} />}
      {node.san}
      {node.nags.map((n) => (
        <sup key={n} className="mv-nag">
          {nagGlyph(n)}
        </sup>
      ))}
    </span>,
  ];

  if (node.comment) {
    out.push(
      " ",
      <span key={`${key}-c`} className="mv-comment">
        {node.comment}
      </span>,
    );
  }

  let forceNumberNext = Boolean(node.comment);
  if (node.children.length > 1) {
    for (let i = 1; i < node.children.length; i++) {
      out.push(
        " ",
        <span key={`${key}-v${i}`} className="mv-var">
          ({renderNode(node.children[i], [...path, i], selected, onSelect, true)})
        </span>,
      );
    }
    forceNumberNext = true; // depois de uma variante, o número reaparece pra clareza
  }

  if (node.children.length > 0) {
    out.push(...renderNode(node.children[0], [...path, 0], selected, onSelect, forceNumberNext));
  }

  return out;
}

export default function MoveList({ game, path, onSelect }: Props) {
  const empty = game.root.length === 0;
  return (
    <div className="movelist">
      <h2 className="movelist-title">{t("moves.title")}</h2>
      {game.preambleComment && <p className="mv-comment mv-preamble">{game.preambleComment}</p>}
      {empty ? (
        <p className="movelist-empty">{t("moves.empty")}</p>
      ) : (
        <div className="movelist-body">
          <span
            className={`mv mv-start${path.length === 0 ? " mv-selected" : ""}`}
            onClick={() => onSelect([])}
          >
            {t("moves.start")}
          </span>{" "}
          {game.root.map((r, i) => (
            <Fragment key={i}>{renderNode(r, [i], path, onSelect, true)}</Fragment>
          ))}
          {game.result && <span className="mv-result"> {game.result}</span>}
        </div>
      )}
      {game.error && <div className="banner warn mv-error">{t("error.parse", { msg: game.error })}</div>}
    </div>
  );
}
