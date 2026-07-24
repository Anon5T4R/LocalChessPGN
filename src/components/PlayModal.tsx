import { useState } from "react";

import type { Difficulty } from "../lib/backend";
import { t, type MessageKey } from "../lib/i18n";

/** O `id` vem do Rust como `string` solto (a fonte da verdade da tabela de
 *  dificuldade é lá — ver `engine.rs`); mapear aqui em vez de crer o tipo
 *  literal é o que deixa o `tsc` continuar recusando chave de i18n faltando. */
const DIFFICULTY_LABEL_KEYS: Record<string, MessageKey> = {
  beginner: "difficulty.beginner",
  casual: "difficulty.casual",
  club: "difficulty.club",
  strong: "difficulty.strong",
  maximum: "difficulty.maximum",
};

interface Props {
  difficulties: Difficulty[];
  starting: boolean;
  onStart: (color: "w" | "b", difficultyId: string) => void;
  onClose: () => void;
}

export default function PlayModal({ difficulties, starting, onStart, onClose }: Props) {
  const [color, setColor] = useState<"w" | "b">("w");
  const [difficultyId, setDifficultyId] = useState(difficulties[2]?.id ?? difficulties[0]?.id ?? "club");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t("play.title")}</h2>
          <button className="icon-btn" onClick={onClose} title={t("library.close")}>
            ✕
          </button>
        </div>

        <div className="tab-body">
          <div className="track-group">
            <span className="track-title">{t("play.side")}</span>
            <div className="view-switch">
              <button className={`view-btn${color === "w" ? " active" : ""}`} onClick={() => setColor("w")}>
                ♔ {t("play.white")}
              </button>
              <button className={`view-btn${color === "b" ? " active" : ""}`} onClick={() => setColor("b")}>
                ♚ {t("play.black")}
              </button>
            </div>
          </div>

          <div className="track-group">
            <span className="track-title">{t("play.difficulty")}</span>
            <div className="preset-list">
              {difficulties.map((d) => (
                <div
                  key={d.id}
                  className={`preset-item${difficultyId === d.id ? " active" : ""}`}
                  onClick={() => setDifficultyId(d.id)}
                >
                  <div>
                    <div className="preset-label">{DIFFICULTY_LABEL_KEYS[d.id] ? t(DIFFICULTY_LABEL_KEYS[d.id]) : d.id}</div>
                    <div className="preset-hint">{d.ccrlLabel}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="tab-foot">
          <button className="btn primary" disabled={starting} onClick={() => onStart(color, difficultyId)}>
            {starting ? t("play.starting") : t("play.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
