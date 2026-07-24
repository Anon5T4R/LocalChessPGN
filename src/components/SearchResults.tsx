import type { SearchHit } from "../lib/backend";
import { t } from "../lib/i18n";
import { useStore } from "../state/store";

function hitLabel(h: SearchHit): string {
  const white = h.white || t("headers.unknownWhite");
  const black = h.black || t("headers.unknownBlack");
  return `${white} — ${black}`;
}

export default function SearchResults() {
  const results = useStore((s) => s.searchResults);
  const loading = useStore((s) => s.searchLoading);
  const openHit = useStore((s) => s.openSearchHit);
  const close = useStore((s) => s.clearSearchResults);

  return (
    <div className="movelist">
      <div className="movelist-title-row">
        <h2 className="movelist-title">{t("search.title")}</h2>
        <button className="icon-btn" onClick={close} title={t("search.back")}>
          ✕
        </button>
      </div>
      {loading && <p className="movelist-empty">{t("search.loading")}</p>}
      {!loading && results && results.length === 0 && <p className="movelist-empty">{t("search.empty")}</p>}
      {!loading && results && results.length > 0 && (
        <div className="library-list">
          {results.map((h, i) => (
            <div key={`${h.gameId}-${h.ply}-${i}`} className="library-row">
              <div className="library-row-main" onClick={() => void openHit(h)}>
                <div className="library-row-players">{hitLabel(h)}</div>
                <div className="library-row-meta">
                  {[h.event, h.date].filter(Boolean).join(" · ")} {h.result} — {t("search.atPly", { ply: h.ply })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
