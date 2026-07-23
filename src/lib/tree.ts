import type { GameRecord, MoveNode } from "./backend";

/** Um nó é identificado pelo caminho de índices desde a raiz (a posição
 *  ANTES de qualquer lance é `[]`). `path[0]` escolhe entre os lances
 *  alternativos da raiz (mainline = 0); cada índice seguinte escolhe entre
 *  `node.children` (children[0] = continuação da linha; o resto = variantes). */
export type Path = number[];

export function nodeAtPath(roots: MoveNode[], path: Path): MoveNode | null {
  if (path.length === 0) return null;
  let node: MoveNode | undefined = roots[path[0]];
  for (let i = 1; node && i < path.length; i++) node = node.children[path[i]];
  return node ?? null;
}

export function fenAtPath(game: GameRecord, path: Path): string {
  if (path.length === 0) return game.startFen;
  return nodeAtPath(game.root, path)?.fen ?? game.startFen;
}

/** Próximo lance da LINHA PRINCIPAL a partir daqui (ignora variantes —
 *  navegação por teclado sempre segue o `children[0]`). Sem continuação,
 *  devolve o mesmo caminho (fim de linha). */
export function nextPath(game: GameRecord, path: Path): Path {
  const children = path.length === 0 ? game.root : (nodeAtPath(game.root, path)?.children ?? []);
  return children.length === 0 ? path : [...path, 0];
}

/** Lance anterior (sobe um nível). No início, devolve `[]` de novo. */
export function prevPath(path: Path): Path {
  return path.length === 0 ? path : path.slice(0, -1);
}

/** Segue `nextPath` até o fim da linha principal. */
export function endPath(game: GameRecord, path: Path): Path {
  let p = path;
  for (;;) {
    const np = nextPath(game, p);
    if (np.length === p.length) return p;
    p = np;
  }
}

export function samePath(a: Path, b: Path): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
