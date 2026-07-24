import { useEffect, useState } from "react";

import Board from "./components/Board";
import LibraryPanel from "./components/LibraryPanel";
import MoveList from "./components/MoveList";
import SearchResults from "./components/SearchResults";
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

const PROMOTION_ROLES = ["q", "r", "b", "n"] as const;

export default function App() {
  const games = useStore((s) => s.games);
  const gameIndex = useStore((s) => s.gameIndex);
  const path = useStore((s) => s.path);
  const error = useStore((s) => s.error);
  const filePath = useStore((s) => s.filePath);
  const dirty = useStore((s) => s.dirty);
  const openPgn = useStore((s) => s.openPgn);
  const loadGames = useStore((s) => s.loadGames);
  const selectGame = useStore((s) => s.selectGame);
  const selectPath = useStore((s) => s.selectPath);
  const goStart = useStore((s) => s.goStart);
  const goPrev = useStore((s) => s.goPrev);
  const goNext = useStore((s) => s.goNext);
  const goEnd = useStore((s) => s.goEnd);
  const selectedSquare = useStore((s) => s.selectedSquare);
  const legalDests = useStore((s) => s.legalDests);
  const promotionPending = useStore((s) => s.promotionPending);
  const clickSquare = useStore((s) => s.clickSquare);
  const resolvePromotion = useStore((s) => s.resolvePromotion);
  const cancelPromotion = useStore((s) => s.cancelPromotion);
  const setComment = useStore((s) => s.setComment);
  const toggleNag = useStore((s) => s.toggleNag);
  const save = useStore((s) => s.save);
  const libraryOpen = useStore((s) => s.libraryOpen);
  const toggleLibrary = useStore((s) => s.toggleLibrary);
  const initLibraryEvents = useStore((s) => s.initLibraryEvents);
  const searchResults = useStore((s) => s.searchResults);
  const searchCurrentPosition = useStore((s) => s.searchCurrentPosition);

  const locale = useLocale();
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    initLibraryEvents();
  }, [initLibraryEvents]);

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

  // Não deixa fechar a janela com alteração não salva sem avisar.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const game = games[gameIndex];
  const devSampleAvailable = import.meta.env.DEV && !inTauri();
  const canSave = dirty && filePath !== null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">♞</span>
          <span className="brand-name">LocalChessPGN</span>
        </div>
        <div className="topbar-actions">
          {devSampleAvailable && (
            <button className="btn ghost small" onClick={() => loadGames([DEV_SAMPLE_GAME])}>
              Dev: sample
            </button>
          )}
          {game && (
            <button className="btn small" disabled={!canSave} onClick={() => void save()} title={t("save.title")}>
              {dirty ? t("save.dirty") : t("save.clean")}
            </button>
          )}
          <button className={`btn small${libraryOpen ? " active" : ""}`} onClick={toggleLibrary} title={t("library.toggle")}>
            📚 {t("library.toggle")}
          </button>
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
                <div className="board-wrap">
                  <Board
                    fen={fenAtPath(game, path)}
                    selectedSquare={selectedSquare}
                    legalDests={legalDests}
                    onSquareClick={(sq) => void clickSquare(sq)}
                  />
                  {promotionPending && (
                    <div className="promo-picker">
                      {PROMOTION_ROLES.map((r) => (
                        <button key={r} className="promo-btn" onClick={() => void resolvePromotion(r)} title={t(`promotion.${r}`)}>
                          {{ q: "♕", r: "♖", b: "♗", n: "♘" }[r]}
                        </button>
                      ))}
                      <button className="promo-btn promo-cancel" onClick={cancelPromotion} title={t("promotion.cancel")}>
                        ✕
                      </button>
                    </div>
                  )}
                </div>
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
                  <span className="toolbar-sep" />
                  <button className="btn small" title={t("search.button")} onClick={() => void searchCurrentPosition()}>
                    🔍 {t("search.button")}
                  </button>
                </div>
              </div>
              {searchResults ? (
                <SearchResults />
              ) : (
                <MoveList game={game} path={path} onSelect={selectPath} onComment={setComment} onToggleNag={toggleNag} />
              )}
            </div>
          </>
        )}
      </main>

      <LibraryPanel />
    </div>
  );
}
