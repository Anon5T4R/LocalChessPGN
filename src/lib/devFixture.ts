import type { GameRecord } from "./backend";

/**
 * Amostra pra smoke visual FORA do Tauri (`npm run dev` num navegador comum
 * não tem a ponte `invoke` — ver `inTauri()`). NÃO é gerada à mão: é o JSON
 * de verdade que `parse_pgn_bytes` devolveu pra
 * `"1. e4 e5 2. Nf3 (2. f4!? { Gambito do rei. } Nc6) 2... Nc6 3. Bb5 a6 4. Ba4 *"`
 * (capturado com `cargo test -- --nocapture`), colado aqui — então todo FEN
 * e todo `ply` já passou pelo `shakmaty` de verdade. Só usada em dev; o
 * caminho real de produção é sempre `parse_pgn_file`/`parse_pgn_text`.
 */
export const DEV_SAMPLE_GAME: GameRecord = {
  headers: [],
  startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  startPly: 1,
  result: "*",
  preambleComment: null,
  error: null,
  root: [
    {
      ply: 1,
      san: "e4",
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      comment: null,
      nags: [],
      children: [
        {
          ply: 2,
          san: "e5",
          fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
          comment: null,
          nags: [],
          children: [
            {
              ply: 3,
              san: "Nf3",
              fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
              comment: null,
              nags: [],
              children: [
                {
                  ply: 4,
                  san: "Nc6",
                  fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
                  comment: null,
                  nags: [],
                  children: [
                    {
                      ply: 5,
                      san: "Bb5",
                      fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
                      comment: null,
                      nags: [],
                      children: [
                        {
                          ply: 6,
                          san: "a6",
                          fen: "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
                          comment: null,
                          nags: [],
                          children: [
                            {
                              ply: 7,
                              san: "Ba4",
                              fen: "r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 4",
                              comment: null,
                              nags: [],
                              children: [],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              ply: 3,
              san: "f4",
              fen: "rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq - 0 2",
              comment: "Gambito do rei.",
              nags: [5],
              children: [
                {
                  ply: 4,
                  san: "Nc6",
                  fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4PP2/8/PPPP2PP/RNBQKBNR w KQkq - 1 3",
                  comment: null,
                  nags: [],
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
