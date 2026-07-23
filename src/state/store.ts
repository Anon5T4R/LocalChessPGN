import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import * as be from "../lib/backend";
import type { GameRecord } from "../lib/backend";
import { endPath, nextPath, prevPath, type Path } from "../lib/tree";

interface StoreState {
  games: GameRecord[];
  gameIndex: number;
  path: Path;
  loading: boolean;
  error: string | null;

  openPgn: () => Promise<void>;
  selectGame: (i: number) => void;
  selectPath: (p: Path) => void;
  goStart: () => void;
  goPrev: () => void;
  goNext: () => void;
  goEnd: () => void;
}

export const useStore = create<StoreState>((set) => ({
  games: [],
  gameIndex: 0,
  path: [],
  loading: false,
  error: null,

  openPgn: async () => {
    if (!be.inTauri()) return;
    set({ loading: true, error: null });
    try {
      const picked = await open({ multiple: false, filters: [{ name: "PGN", extensions: ["pgn"] }] });
      if (!picked || Array.isArray(picked)) {
        set({ loading: false });
        return;
      }
      const games = await be.parsePgnFile(picked);
      set({ games, gameIndex: 0, path: [], loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectGame: (i) => set((s) => (i >= 0 && i < s.games.length ? { gameIndex: i, path: [] } : s)),

  selectPath: (p) => set({ path: p }),
  goStart: () => set({ path: [] }),
  goPrev: () => set((s) => ({ path: prevPath(s.path) })),
  goNext: () =>
    set((s) => {
      const g = s.games[s.gameIndex];
      return g ? { path: nextPath(g, s.path) } : s;
    }),
  goEnd: () =>
    set((s) => {
      const g = s.games[s.gameIndex];
      return g ? { path: endPath(g, s.path) } : s;
    }),
}));

// Dev: expõe o store pra smoke no console (fora do Tauri, ver App.tsx pro
// carregamento de amostra usado no preview do navegador).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__store = useStore;
}
