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
