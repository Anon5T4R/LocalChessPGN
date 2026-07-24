# LocalChessPGN

**Leitor e editor de PGN, 100% offline.** Carregue uma partida, navegue pelos lances e pelas
variantes num tabuleiro de verdade — sem nenhum arquivo sair do computador.

Parte da suíte **Local/Taylor** de aplicativos offline-first.

## Estado

**v0.4.0 — escopo original completo.** Leitor **e editor** de PGN: carrega um arquivo `.pgn` (um
ou vários jogos), mostra o tabuleiro na posição de cada lance e deixa navegar a árvore inteira —
lance principal e variantes, comentários e anotações (NAG) inclusos. Dá pra **jogar no próprio
tabuleiro** (clique na peça, clique no destino destacado — com escolha de peça na promoção),
**criar variantes** de verdade (um lance que já existe navega até ele; um lance novo vira
variante), **anotar** (comentário + NAG por lance) e **salvar** de volta pro `.pgn` (gravação
atômica).

Tem **biblioteca**: aponte um ou mais arquivos `.pgn` e eles entram numa base persistente
(SQLite local, nada embutido/baixado). Cada partida é indexada por **posição** (hash Zobrist
compatível com Polyglot) — a qualquer momento dá pra **buscar "quem já passou por esta posição do
tabuleiro"**, e a busca acha por transposição de verdade (ordens de lance diferentes que chegam
na mesma posição), não só por prefixo de movetext igual.

E tem **Stockfish** embarcado (processo separado, protocolo UCI): **consulte a qualquer
momento** (o motor sugere o lance e a avaliação da posição atual, com botão pra jogar o que ele
sugeriu) ou **jogue contra ele**, escolhendo lado e uma entre 5 dificuldades. A dificuldade usa
`Skill Level` + teto de profundidade do próprio Stockfish — **não** `UCI_Elo`: essa opção mede
força numa escala de motor-contra-motor (CCRL), não a de humano/chess.com, e os rótulos mostram
isso (`≈2200 CCRL`, não `"2200"` solto).

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

A engine é o [Stockfish](https://stockfishchess.org) (tag `sf_18`), build oficial **não
modificada**, usada como **processo separado** via protocolo UCI — nunca linkada. O Stockfish é
licenciado sob [GPL-3.0-or-later](https://github.com/official-stockfish/Stockfish/blob/sf_18/Copying.txt);
o fonte correspondente está em <https://github.com/official-stockfish/Stockfish/tree/sf_18>. Três
variantes (avx2/bmi2/sse41-popcnt) vêm embutidas — o app tenta cada uma nesta ordem até achar a
que a CPU aguenta.
