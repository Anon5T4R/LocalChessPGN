import { describe, expect, it } from "vitest";
import type { GameRecord, MoveNode } from "../backend";
import { endPath, fenAtPath, nextPath, nodeAtPath, prevPath, samePath } from "../tree";

// Mesma forma de árvore do teste `variation_comment_and_nag` no Rust:
// 1.e4 e5 2.Nf3 (2.f4 Nc6) 2...Nc6 — a variante é irmã de Nf3 (mesmo pai: e5).
function node(san: string, children: MoveNode[] = []): MoveNode {
  return { ply: 0, san, fen: `fen(${san})`, comment: null, nags: [], children };
}

const nc6Main = node("Nc6-main");
const nc6Var = node("Nc6-var");
const nf3 = node("Nf3", [nc6Main]);
const f4 = node("f4", [nc6Var]);
const e5 = node("e5", [nf3, f4]);
const e4 = node("e4", [e5]);

const game: GameRecord = {
  headers: [],
  startFen: "start",
  startPly: 1,
  root: [e4],
  result: null,
  preambleComment: null,
  error: null,
};

describe("nodeAtPath / fenAtPath", () => {
  it("[] é a posição inicial", () => {
    expect(nodeAtPath(game.root, [])).toBeNull();
    expect(fenAtPath(game, [])).toBe("start");
  });

  it("desce a linha principal", () => {
    expect(nodeAtPath(game.root, [0])?.san).toBe("e4");
    expect(nodeAtPath(game.root, [0, 0])?.san).toBe("e5");
    expect(nodeAtPath(game.root, [0, 0, 0])?.san).toBe("Nf3");
    expect(nodeAtPath(game.root, [0, 0, 0, 0])?.san).toBe("Nc6-main");
  });

  it("desce pela variante", () => {
    expect(nodeAtPath(game.root, [0, 0, 1])?.san).toBe("f4");
    expect(nodeAtPath(game.root, [0, 0, 1, 0])?.san).toBe("Nc6-var");
  });

  it("caminho inválido devolve null, não quebra", () => {
    expect(nodeAtPath(game.root, [5])).toBeNull();
    expect(nodeAtPath(game.root, [0, 0, 0, 5])).toBeNull();
  });
});

describe("nextPath / prevPath / endPath", () => {
  it("nextPath sempre segue a MAINLINE (children[0]), mesmo vindo de uma variante", () => {
    expect(nextPath(game, [])).toEqual([0]);
    expect(nextPath(game, [0])).toEqual([0, 0]);
    // a partir da variante f4, o "próximo" é a continuação DELA (Nc6-var),
    // não um salto de volta pra mainline — nextPath não muda de linha.
    expect(nextPath(game, [0, 0, 1])).toEqual([0, 0, 1, 0]);
  });

  it("nextPath no fim de linha fica parado", () => {
    const end = [0, 0, 0, 0];
    expect(nextPath(game, end)).toEqual(end);
  });

  it("prevPath sobe um nível; na raiz fica em []", () => {
    expect(prevPath([0, 0, 0])).toEqual([0, 0]);
    expect(prevPath([])).toEqual([]);
  });

  it("endPath segue a mainline inteira a partir de []", () => {
    expect(endPath(game, [])).toEqual([0, 0, 0, 0]);
  });

  it("endPath a partir de dentro de uma variante segue o resto DELA", () => {
    expect(endPath(game, [0, 0, 1])).toEqual([0, 0, 1, 0]);
  });
});

describe("samePath", () => {
  it("compara por valor, não por referência", () => {
    expect(samePath([0, 1], [0, 1])).toBe(true);
    expect(samePath([], [])).toBe(true);
    expect(samePath([0], [0, 1])).toBe(false);
    expect(samePath([0, 1], [0, 2])).toBe(false);
  });
});
