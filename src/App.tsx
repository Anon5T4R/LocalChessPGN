import { useEffect, useState } from "react";

import Board from "./components/Board";
import MoveList from "./components/MoveList";
import { inTauri } from "./lib/backend";
import { DEV_SAMPLE_GAME } from "./lib/devFixture";
import { fenAtPath } from "./lib/tree";
import { LOCALE_LABELS, type Locale, setLocale, t, useLocale } from "./lib/i18n";
import { applyTheme, loadTheme, THEME_LABEL_KEYS, THEMES, type Theme } from "./lib/theme";
import { useStore } from "./state/store";

const LOCALES: Locale[] = ["pt", "en", "es"];

/** Não rouba a tecla de quem está digitando/focado num controle de formulário. */
function shouldIgnoreKey(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return /^(input|select|textarea|button|a)$/i.test(el.tagName);
}

function gameLabel(headers: [string, string][]): string {
  const get = (k: string) => headers.find(([name]) => name === k)?.[1];
  const white = get("White") || t("headers.unknownWhite");
  const black = get("Black") || t("headers.unknownBlack");
  const result = get("Result") || t("headers.noResult");
  return `${white} — ${black} (${result})`;
}

export default function App() {
  const games = useStore((s) => s.games);
  const gameIndex = useStore((s) => s.gameIndex);
  const path = useStore((s) => s.path);
  const error = useStore((s) => s.error);
  const openPgn = useStore((s) => s.openPgn);
  const selectGame = useStore((s) => s.selectGame);
  const selectPath = useStore((s) => s.selectPath);
  const goStart = useStore((s) => s.goStart);
  const goPrev = useStore((s) => s.goPrev);
  const goNext = useStore((s) => s.goNext);
  const goEnd = useStore((s) => s.goEnd);

  const locale = useLocale();
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (shouldIgnoreKey(e.target)) return;
      if (games.length === 0) return;
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Home") goStart();
      else if (e.key === "End") goEnd();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [games.length, goPrev, goNext, goStart, goEnd]);

  const game = games[gameIndex];
  const devSampleAvailable = import.meta.env.DEV && !inTauri();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">♞</span>
          <span className="brand-name">LocalChessPGN</span>
        </div>
        <div className="topbar-actions">
          {devSampleAvailable && (
            <button
              className="btn ghost small"
              onClick={() => useStore.setState({ games: [DEV_SAMPLE_GAME], gameIndex: 0, path: [] })}
            >
              Dev: sample
            </button>
          )}
          <button className="btn primary" onClick={() => void openPgn()}>
            + {t("topbar.open")}
          </button>
          <select
            className="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            title={t("topbar.theme")}
          >
            {THEMES.map((th) => (
              <option key={th} value={th}>
                {t(THEME_LABEL_KEYS[th])}
              </option>
            ))}
          </select>
          <select
            className="lang-select"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            title={t("lang.title")}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="main">
        {error && <div className="banner warn">{error}</div>}

        {!game ? (
          <div className="empty-hero" onClick={() => void openPgn()}>
            <div className="drop-icon">♞</div>
            <h1>{t("app.title")}</h1>
            <p className="home-sub">{t("app.sub")}</p>
          </div>
        ) : (
          <>
            {games.length > 1 && (
              <div className="games-bar">
                <span className="games-count">
                  {games.length === 1 ? t("games.oneFound") : t("games.nFound", { n: games.length })}
                </span>
                <select
                  className="games-select"
                  value={gameIndex}
                  onChange={(e) => selectGame(Number(e.target.value))}
                >
                  {games.map((g, i) => (
                    <option key={i} value={i}>
                      {gameLabel(g.headers)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="workspace">
              <div className="board-pane">
                <Board fen={fenAtPath(game, path)} />
                <div className="board-nav">
                  <button className="btn small" title={t("nav.start")} onClick={goStart}>
                    ⏮
                  </button>
                  <button className="btn small" title={t("nav.prev")} onClick={goPrev}>
                    ◀
                  </button>
                  <button className="btn small" title={t("nav.next")} onClick={goNext}>
                    ▶
                  </button>
                  <button className="btn small" title={t("nav.end")} onClick={goEnd}>
                    ⏭
                  </button>
                </div>
              </div>
              <MoveList game={game} path={path} onSelect={selectPath} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
