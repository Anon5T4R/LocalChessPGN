import { Fragment } from "react";
import type { ReactNode } from "react";
import type { GameRecord, MoveNode } from "../lib/backend";
import { nagGlyph } from "../lib/nag";
import { nodeAtPath, samePath, type Path } from "../lib/tree";
import { t } from "../lib/i18n";

interface Props {
  game: GameRecord;
  path: Path;
  onSelect: (p: Path) => void;
  onComment: (text: string) => void;
  onToggleNag: (nag: number) => void;
}

/** Os 6 NAGs "clássicos" — os únicos com glifo curto; qualquer outro (de uma
 *  importação, por exemplo) continua mostrado na lista de lances como "$N",
 *  só não ganha botão aqui. */
const COMMON_NAGS = [1, 2, 3, 4, 5, 6];

function MoveNumberLabel({ ply }: { ply: number }) {
  const num = Math.ceil(ply / 2);
  const isWhite = ply % 2 === 1;
  return <span className="mv-num">{num}{isWhite ? "." : "…"} </span>;
}

/** Um lance, escrito com as variantes DELE (não do que vem depois) coladas
 *  logo em seguida, e só então a continuação da linha principal. `siblings`
 *  são as alternativas a `node` — moram no MESMO pai que ele, por isso o
 *  caminho de cada uma é `[...siblingsBasePath, i+1]`, não um filho de
 *  `node`. Escrever a variante ANTES do lance (em vez de depois) foi um bug
 *  real: achado espelhando o mesmo erro no serializador Rust, onde ele
 *  quebrava o round-trip (a variante virava lance ilegal na posição errada
 *  ao reabrir o PGN gerado). */
function renderNode(
  node: MoveNode,
  siblings: MoveNode[],
  path: Path,
  siblingsBasePath: Path,
  selected: Path,
  onSelect: (p: Path) => void,
  forceNumber: boolean,
): ReactNode[] {
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

  siblings.forEach((v, i) => {
    const vPath = [...siblingsBasePath, i + 1];
    out.push(
      " ",
      <span key={`${key}-v${i}`} className="mv-var">
        ({renderNode(v, [], vPath, vPath, selected, onSelect, true)})
      </span>,
    );
  });

  const forceNext = Boolean(node.comment) || siblings.length > 0;
  if (node.children.length > 0) {
    out.push(...renderNode(node.children[0], node.children.slice(1), [...path, 0], path, selected, onSelect, forceNext));
  }

  return out;
}

export default function MoveList({ game, path, onSelect, onComment, onToggleNag }: Props) {
  const empty = game.root.length === 0;
  const selected = path.length > 0 ? nodeAtPath(game.root, path) : null;

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
          {game.root.length > 0 && (
            <Fragment>{renderNode(game.root[0], game.root.slice(1), [0], [], path, onSelect, true)}</Fragment>
          )}
          {game.result && <span className="mv-result"> {game.result}</span>}
        </div>
      )}
      {game.error && <div className="banner warn mv-error">{t("error.parse", { msg: game.error })}</div>}

      {selected && (
        <div className="annotate">
          <div className="annotate-nags">
            {COMMON_NAGS.map((n) => (
              <button
                key={n}
                className={`nag-btn${selected.nags.includes(n) ? " active" : ""}`}
                onClick={() => onToggleNag(n)}
                title={t("annotate.nagTitle", { glyph: nagGlyph(n) })}
              >
                {nagGlyph(n)}
              </button>
            ))}
          </div>
          <textarea
            key={path.join(".")}
            className="annotate-comment"
            placeholder={t("annotate.commentPlaceholder")}
            defaultValue={selected.comment ?? ""}
            onBlur={(e) => onComment(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
