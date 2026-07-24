import type { LibraryGameSummary } from "../lib/backend";
import { t } from "../lib/i18n";
import { useStore } from "../state/store";

function gameLabel(g: LibraryGameSummary): string {
  const white = g.white || t("headers.unknownWhite");
  const black = g.black || t("headers.unknownBlack");
  return `${white} — ${black}`;
}

export default function LibraryPanel() {
  const libraryOpen = useStore((s) => s.libraryOpen);
  const games = useStore((s) => s.libraryGames);
  const hasMore = useStore((s) => s.libraryHasMore);
  const loading = useStore((s) => s.libraryLoading);
  const indexProgress = useStore((s) => s.indexProgress);
  const lastAddSummary = useStore((s) => s.lastAddSummary);
  const toggleLibrary = useStore((s) => s.toggleLibrary);
  const addFiles = useStore((s) => s.addFilesToLibrary);
  const cancelAdding = useStore((s) => s.cancelAddingFiles);
  const loadMore = useStore((s) => s.loadMoreLibrary);
  const removeGame = useStore((s) => s.removeFromLibrary);
  const openGame = useStore((s) => s.openFromLibrary);

  if (!libraryOpen) return null;

  const pct = indexProgress && indexProgress.total > 0 ? Math.round((100 * indexProgress.done) / indexProgress.total) : 0;

  return (
    <div className="library-panel">
      <div className="library-head">
        <h2>{t("library.title")}</h2>
        <button className="icon-btn" onClick={toggleLibrary} title={t("library.close")}>
          ✕
        </button>
      </div>

      <button className="btn primary" onClick={() => void addFiles()} disabled={!!indexProgress}>
        + {t("library.addFiles")}
      </button>

      {indexProgress && (
        <div className="library-progress">
          <div className="pbar">
            <div className="pbar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="library-progress-label">
            {indexProgress.done}/{indexProgress.total}
            {indexProgress.currentFile ? ` — ${indexProgress.currentFile}` : ""}
          </div>
          <button className="btn small" onClick={cancelAdding}>
            {t("library.cancelAdding")}
          </button>
        </div>
      )}

      {lastAddSummary && !indexProgress && (
        <p className="library-summary">
          {t("library.addSummary", { added: lastAddSummary.gamesAdded, skipped: lastAddSummary.gamesSkipped })}
        </p>
      )}

      <div className="library-list">
        {games.length === 0 && !loading && <p className="movelist-empty">{t("library.empty")}</p>}
        {games.map((g) => (
          <div key={g.id} className="library-row">
            <div className="library-row-main" onClick={() => void openGame(g.id)}>
              <div className="library-row-players">{gameLabel(g)}</div>
              <div className="library-row-meta">
                {[g.event, g.date].filter(Boolean).join(" · ")} {g.result}
              </div>
            </div>
            <button className="icon-btn" title={t("library.remove")} onClick={() => void removeGame(g.id)}>
              🗑
            </button>
          </div>
        ))}
      </div>

      {hasMore && games.length > 0 && (
        <button className="btn small" disabled={loading} onClick={() => void loadMore()}>
          {t("library.loadMore")}
        </button>
      )}
    </div>
  );
}
