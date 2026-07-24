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

/** Ply do nó em `path` (ou do 1º lance a jogar, se `path` for `[]`). */
export function plyAtPath(game: GameRecord, path: Path): number {
  return path.length === 0 ? game.startPly : (nodeAtPath(game.root, path)?.ply ?? game.startPly);
}

/** Atualiza IMUTAVELMENTE o nó em `path` (recria só a espinha raiz→nó, o
 *  resto da árvore continua apontando pros MESMOS objetos). É o que faz um
 *  `useStore(s => s.games[i])` perceber a mudança — mutar em lugar mudaria o
 *  conteúdo sem trocar a referência, e o React não re-renderiza. */
export function updateNodeAtPath(game: GameRecord, path: Path, mutate: (node: MoveNode) => MoveNode): GameRecord {
  if (path.length === 0) return game;
  function recur(nodes: MoveNode[], idx: number, rest: Path): MoveNode[] {
    const arr = [...nodes];
    const node = arr[idx];
    arr[idx] = rest.length === 0 ? mutate(node) : { ...node, children: recur(node.children, rest[0], rest.slice(1)) };
    return arr;
  }
  return { ...game, root: recur(game.root, path[0], path.slice(1)) };
}

/** Acrescenta `child` nos filhos do nó em `parentPath` (`[]` = raiz da
 *  partida) — vira mainline se for o 1º filho, senão vira variante. Também
 *  imutável, mesmo motivo do `updateNodeAtPath`. Devolve o `Path` do nó
 *  recém-criado, pronto pra navegar até ele. */
export function insertChildAtPath(game: GameRecord, parentPath: Path, child: MoveNode): { game: GameRecord; path: Path } {
  if (parentPath.length === 0) {
    const root = [...game.root, child];
    return { game: { ...game, root }, path: [root.length - 1] };
  }
  let insertedIndex = -1;
  function recur(nodes: MoveNode[], idx: number, rest: Path): MoveNode[] {
    const arr = [...nodes];
    const node = arr[idx];
    if (rest.length === 0) {
      const children = [...node.children, child];
      insertedIndex = children.length - 1;
      arr[idx] = { ...node, children };
    } else {
      arr[idx] = { ...node, children: recur(node.children, rest[0], rest.slice(1)) };
    }
    return arr;
  }
  const root = recur(game.root, parentPath[0], parentPath.slice(1));
  return { game: { ...game, root }, path: [...parentPath, insertedIndex] };
}

/** Acha o caminho até um nó com este FEN exato (varre a árvore INTEIRA,
 *  mainline e variantes). Usado ao abrir um resultado de busca por posição
 *  — a busca já roda pelo FEN certo, então achar de volta é comparar texto,
 *  não recalcular nada. `null` se a posição não estiver na árvore (não
 *  deveria acontecer vindo de um resultado de busca, mas o chamador tem que
 *  tratar como "não achei" em vez de presumir). */
export function findPathByFen(game: GameRecord, fen: string): Path | null {
  if (game.startFen === fen) return [];
  function search(nodes: MoveNode[], prefix: Path): Path | null {
    for (let i = 0; i < nodes.length; i++) {
      const path = [...prefix, i];
      if (nodes[i].fen === fen) return path;
      const found = search(nodes[i].children, path);
      if (found) return found;
    }
    return null;
  }
  return search(game.root, []);
}
