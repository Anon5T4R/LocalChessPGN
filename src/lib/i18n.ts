import { useSyncExternalStore } from "react";

/**
 * i18n leve da UI (padrão da suíte — `docs/planos/padrao-apps.md`). `pt` é a
 * fonte da verdade; `en`/`es` como `Record<MessageKey,string>` forçam completude
 * (o `tsc` recusa chave faltando/sobrando). Locale num store externo pra `t()`
 * rodar fora de componente; o App remonta com `key={locale}` no `main.tsx`.
 */

export type Locale = "pt" | "en" | "es";

export const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

const LOCALE_KEY = "localchesspgn.locale";

const pt = {
  "app.title": "Abra uma partida",
  "app.sub": "Carregue um arquivo .pgn — o tabuleiro e a árvore de lances (com variantes) aparecem aqui. Nada sai do computador.",
  "topbar.open": "Abrir PGN",
  "topbar.theme": "Tema",

  "theme.light": "Claro",
  "theme.dark": "Escuro",
  "theme.nature": "Natureza",
  "theme.darkblue": "Azul escuro",
  "theme.calmgreen": "Verde calmo",
  "theme.pastelpink": "Rosa pastel",
  "theme.punkprincess": "PunkPrincess",

  "lang.title": "Idioma / Language",

  "games.title": "Partidas",
  "games.oneFound": "1 partida encontrada",
  "games.nFound": "{n} partidas encontradas",

  "headers.unknownWhite": "Brancas",
  "headers.unknownBlack": "Pretas",
  "headers.noResult": "*",

  "moves.title": "Lances",
  "moves.start": "Início",
  "moves.empty": "Nenhum lance nesta partida.",
  "moves.comment": "Comentário",

  "board.whiteToMove": "Brancas jogam",
  "board.blackToMove": "Pretas jogam",

  "nav.start": "Início da partida",
  "nav.prev": "Lance anterior",
  "nav.next": "Próximo lance (linha principal)",
  "nav.end": "Fim da linha",

  "error.parse": "Não consegui ler este PGN: {msg}",
  "error.empty": "Nenhuma partida encontrada neste arquivo.",

  "save.title": "Salvar PGN",
  "save.dirty": "Salvar",
  "save.clean": "Salvo",

  "promotion.q": "Promover a Dama",
  "promotion.r": "Promover a Torre",
  "promotion.b": "Promover a Bispo",
  "promotion.n": "Promover a Cavalo",
  "promotion.cancel": "Cancelar",

  "annotate.commentPlaceholder": "Comentário deste lance…",
  "annotate.nagTitle": "Anotação {glyph}",

  "library.toggle": "Biblioteca",
  "library.title": "Biblioteca",
  "library.close": "Fechar",
  "library.addFiles": "Adicionar arquivos .pgn",
  "library.cancelAdding": "Cancelar",
  "library.addSummary": "{added} partida(s) adicionada(s), {skipped} pulada(s).",
  "library.empty": "Nenhuma partida na biblioteca ainda. Aponte um ou mais arquivos .pgn.",
  "library.remove": "Remover da biblioteca",
  "library.loadMore": "Carregar mais",

  "search.button": "Buscar esta posição",
  "search.title": "Partidas com esta posição",
  "search.back": "Voltar aos lances",
  "search.loading": "Buscando…",
  "search.empty": "Nenhuma partida da biblioteca passou por esta posição.",
  "search.atPly": "lance {ply}",

  "engine.consult": "Consultar motor",
  "engine.thinking": "Pensando…",
  "engine.suggestion": "Sugestão",
  "engine.playSuggested": "Jogar este lance",

  "play.toggle": "Jogar contra",
  "play.stop": "Parar de jogar",
  "play.title": "Jogar contra o Stockfish",
  "play.side": "Suas peças",
  "play.white": "Brancas",
  "play.black": "Pretas",
  "play.difficulty": "Dificuldade",
  "play.start": "Começar",
  "play.starting": "Iniciando o motor…",
  "play.playingAs": "Você joga de {color}",

  "difficulty.beginner": "Iniciante",
  "difficulty.casual": "Casual",
  "difficulty.club": "Clube",
  "difficulty.strong": "Forte",
  "difficulty.maximum": "Máximo",
} as const;

export type MessageKey = keyof typeof pt;

const en: Record<MessageKey, string> = {
  "app.title": "Open a game",
  "app.sub": "Load a .pgn file — the board and the move tree (with variations) show up here. Nothing leaves your computer.",
  "topbar.open": "Open PGN",
  "topbar.theme": "Theme",

  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.nature": "Nature",
  "theme.darkblue": "Dark blue",
  "theme.calmgreen": "Calm green",
  "theme.pastelpink": "Pastel pink",
  "theme.punkprincess": "PunkPrincess",

  "lang.title": "Idioma / Language",

  "games.title": "Games",
  "games.oneFound": "1 game found",
  "games.nFound": "{n} games found",

  "headers.unknownWhite": "White",
  "headers.unknownBlack": "Black",
  "headers.noResult": "*",

  "moves.title": "Moves",
  "moves.start": "Start",
  "moves.empty": "No moves in this game.",
  "moves.comment": "Comment",

  "board.whiteToMove": "White to move",
  "board.blackToMove": "Black to move",

  "nav.start": "Start of game",
  "nav.prev": "Previous move",
  "nav.next": "Next move (mainline)",
  "nav.end": "End of line",

  "error.parse": "Couldn't read this PGN: {msg}",
  "error.empty": "No games found in this file.",

  "save.title": "Save PGN",
  "save.dirty": "Save",
  "save.clean": "Saved",

  "promotion.q": "Promote to Queen",
  "promotion.r": "Promote to Rook",
  "promotion.b": "Promote to Bishop",
  "promotion.n": "Promote to Knight",
  "promotion.cancel": "Cancel",

  "annotate.commentPlaceholder": "Comment on this move…",
  "annotate.nagTitle": "Annotation {glyph}",

  "library.toggle": "Library",
  "library.title": "Library",
  "library.close": "Close",
  "library.addFiles": "Add .pgn files",
  "library.cancelAdding": "Cancel",
  "library.addSummary": "{added} game(s) added, {skipped} skipped.",
  "library.empty": "No games in the library yet. Point at one or more .pgn files.",
  "library.remove": "Remove from library",
  "library.loadMore": "Load more",

  "search.button": "Search this position",
  "search.title": "Games with this position",
  "search.back": "Back to moves",
  "search.loading": "Searching…",
  "search.empty": "No game in the library reached this position.",
  "search.atPly": "move {ply}",

  "engine.consult": "Consult engine",
  "engine.thinking": "Thinking…",
  "engine.suggestion": "Suggestion",
  "engine.playSuggested": "Play this move",

  "play.toggle": "Play against",
  "play.stop": "Stop playing",
  "play.title": "Play against Stockfish",
  "play.side": "Your pieces",
  "play.white": "White",
  "play.black": "Black",
  "play.difficulty": "Difficulty",
  "play.start": "Start",
  "play.starting": "Starting the engine…",
  "play.playingAs": "You're playing {color}",

  "difficulty.beginner": "Beginner",
  "difficulty.casual": "Casual",
  "difficulty.club": "Club",
  "difficulty.strong": "Strong",
  "difficulty.maximum": "Maximum",
};

const es: Record<MessageKey, string> = {
  "app.title": "Abre una partida",
  "app.sub": "Carga un archivo .pgn — el tablero y el árbol de jugadas (con variantes) aparecen aquí. Nada sale de tu ordenador.",
  "topbar.open": "Abrir PGN",
  "topbar.theme": "Tema",

  "theme.light": "Claro",
  "theme.dark": "Oscuro",
  "theme.nature": "Naturaleza",
  "theme.darkblue": "Azul oscuro",
  "theme.calmgreen": "Verde tranquilo",
  "theme.pastelpink": "Rosa pastel",
  "theme.punkprincess": "PunkPrincess",

  "lang.title": "Idioma / Language",

  "games.title": "Partidas",
  "games.oneFound": "1 partida encontrada",
  "games.nFound": "{n} partidas encontradas",

  "headers.unknownWhite": "Blancas",
  "headers.unknownBlack": "Negras",
  "headers.noResult": "*",

  "moves.title": "Jugadas",
  "moves.start": "Inicio",
  "moves.empty": "Ninguna jugada en esta partida.",
  "moves.comment": "Comentario",

  "board.whiteToMove": "Juegan blancas",
  "board.blackToMove": "Juegan negras",

  "nav.start": "Inicio de la partida",
  "nav.prev": "Jugada anterior",
  "nav.next": "Próxima jugada (línea principal)",
  "nav.end": "Fin de la línea",

  "error.parse": "No pude leer este PGN: {msg}",
  "error.empty": "No se encontraron partidas en este archivo.",

  "save.title": "Guardar PGN",
  "save.dirty": "Guardar",
  "save.clean": "Guardado",

  "promotion.q": "Coronar a Dama",
  "promotion.r": "Coronar a Torre",
  "promotion.b": "Coronar a Alfil",
  "promotion.n": "Coronar a Caballo",
  "promotion.cancel": "Cancelar",

  "annotate.commentPlaceholder": "Comentario de esta jugada…",
  "annotate.nagTitle": "Anotación {glyph}",

  "library.toggle": "Biblioteca",
  "library.title": "Biblioteca",
  "library.close": "Cerrar",
  "library.addFiles": "Añadir archivos .pgn",
  "library.cancelAdding": "Cancelar",
  "library.addSummary": "{added} partida(s) añadida(s), {skipped} omitida(s).",
  "library.empty": "Todavía no hay partidas en la biblioteca. Apunta uno o más archivos .pgn.",
  "library.remove": "Quitar de la biblioteca",
  "library.loadMore": "Cargar más",

  "search.button": "Buscar esta posición",
  "search.title": "Partidas con esta posición",
  "search.back": "Volver a las jugadas",
  "search.loading": "Buscando…",
  "search.empty": "Ninguna partida de la biblioteca llegó a esta posición.",
  "search.atPly": "jugada {ply}",

  "engine.consult": "Consultar motor",
  "engine.thinking": "Pensando…",
  "engine.suggestion": "Sugerencia",
  "engine.playSuggested": "Jugar esta jugada",

  "play.toggle": "Jugar contra",
  "play.stop": "Dejar de jugar",
  "play.title": "Jugar contra Stockfish",
  "play.side": "Tus piezas",
  "play.white": "Blancas",
  "play.black": "Negras",
  "play.difficulty": "Dificultad",
  "play.start": "Empezar",
  "play.starting": "Iniciando el motor…",
  "play.playingAs": "Juegas de {color}",

  "difficulty.beginner": "Principiante",
  "difficulty.casual": "Casual",
  "difficulty.club": "Club",
  "difficulty.strong": "Fuerte",
  "difficulty.maximum": "Máximo",
};

const DICTS: Record<Locale, Record<MessageKey, string>> = { pt, en, es };

/* --- store externo do locale (fora do React, pra t() rodar em qualquer lugar) --- */
function initialLocale(): Locale {
  if (typeof localStorage !== "undefined") {
    const s = localStorage.getItem(LOCALE_KEY);
    if (s === "pt" || s === "en" || s === "es") return s;
  }
  return "pt";
}
let locale: Locale = initialLocale();
const listeners = new Set<() => void>();

export function setLocale(next: Locale): void {
  if (next === locale) return;
  locale = next;
  if (typeof localStorage !== "undefined") localStorage.setItem(LOCALE_KEY, next);
  listeners.forEach((l) => l());
}
export function getLocale(): Locale {
  return locale;
}
export function useLocale(): Locale {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => locale,
  );
}

/** Traduz uma chave, com interpolação `{nome}`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s = DICTS[locale][key] ?? pt[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  return s;
}
