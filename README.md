# LocalChessPGN

**Leitor e editor de PGN, 100% offline.** Carregue uma partida, navegue pelos lances e pelas
variantes num tabuleiro de verdade — sem nenhum arquivo sair do computador.

Parte da suíte **Local/Taylor** de aplicativos offline-first.

## Estado

**v0.1.0 (fundação).** Carrega um arquivo `.pgn` (um ou vários jogos), mostra o tabuleiro na
posição de cada lance e deixa navegar a árvore inteira — lance principal e variantes,
comentários e anotações (NAG) inclusos.

### O que vem a seguir

- **Editar**: anotar, criar variante, salvar PGN.
- **Base de partidas** que você aponta, com **busca por posição** (dado um FEN, quais partidas
  passaram por ali).
- **Stockfish** consultável a qualquer momento, e **jogar contra ele** com seleção de dificuldade.

Detalhe completo do plano em `dev-notes/docs/planos/localchesspgn.md`.

## Desenvolvimento

Stack: Tauri 2 + React 19 + Vite + TypeScript (front) e Rust (back). Porta dev **1470**.

```bash
npm install
npm run tauri dev
npm test          # vitest (front); cargo test roda no CI
```

## Créditos e licença

As regras de xadrez e o parser de PGN vêm do [`shakmaty`](https://github.com/niklasf/shakmaty) e
do [`pgn-reader`](https://github.com/niklasf/pgn-reader) (ambos GPL-3.0-or-later, do mesmo autor).
Como Rust **linka** as crates na obra final, **este app é GPL-3.0-or-later — e não MIT como o
resto da suíte.** É a primeira exceção, feita conscientemente: escrever geração de lances legais
à mão (roque, en passant, promoção, afogado, repetição tripla, regra dos 50 lances) é o tipo de
código que ninguém deveria reescrever, e o `shakmaty` já traz isso testado e compatível com o
formato Zobrist/Polyglot.

O texto completo da licença está em [`LICENSE`](LICENSE).
