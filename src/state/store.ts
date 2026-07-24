import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import * as be from "../lib/backend";
import type { AddSummary, GameRecord, IndexProgress, LegalDest, LibraryGameSummary, MoveNode, SearchHit } from "../lib/backend";
import {
  endPath,
  fenAtPath,
  findPathByFen,
  insertChildAtPath,
  nextPath,
  nodeAtPath,
  plyAtPath,
  prevPath,
  type Path,
  updateNodeAtPath,
} from "../lib/tree";

const LIBRARY_PAGE = 30;

interface StoreState {
  games: GameRecord[];
  gameIndex: number;
  path: Path;
  filePath: string | null;
  dirty: boolean;
  loading: boolean;
  error: string | null;

  /** Casa clicada aguardando destino (tabuleiro editável). */
  selectedSquare: string | null;
  legalDests: LegalDest[];
  /** Lance escolhido que precisa saber pra que peça promover. */
  promotionPending: { from: string; to: string } | null;

  openPgn: () => Promise<void>;
  loadGames: (games: GameRecord[]) => void;
  selectGame: (i: number) => void;
  selectPath: (p: Path) => void;
  goStart: () => void;
  goPrev: () => void;
  goNext: () => void;
  goEnd: () => void;

  clickSquare: (square: string) => Promise<void>;
  /** Interno (usado por `clickSquare`/`resolvePromotion`) — não escondido do
   *  tipo porque o zustand faz checagem de propriedade excedente no literal
   *  de retorno; melhor deixar público e documentado do que lutar com isso. */
  resolveMove: (from: string, to: string, promotion?: string) => Promise<void>;
  resolvePromotion: (role: "q" | "r" | "b" | "n") => Promise<void>;
  cancelPromotion: () => void;
  setComment: (text: string) => void;
  toggleNag: (nag: number) => void;
  save: () => Promise<void>;

  // --- Biblioteca (F3/F3b) ---
  libraryOpen: boolean;
  libraryGames: LibraryGameSummary[];
  libraryHasMore: boolean;
  libraryLoading: boolean;
  indexProgress: IndexProgress | null;
  lastAddSummary: AddSummary | null;
  searchResults: SearchHit[] | null;
  searchedFen: string | null;
  searchLoading: boolean;

  initLibraryEvents: () => void;
  toggleLibrary: () => void;
  refreshLibrary: () => Promise<void>;
  loadMoreLibrary: () => Promise<void>;
  addFilesToLibrary: () => Promise<void>;
  cancelAddingFiles: () => void;
  removeFromLibrary: (id: number) => Promise<void>;
  openFromLibrary: (id: number) => Promise<void>;
  searchCurrentPosition: () => Promise<void>;
  openSearchHit: (hit: SearchHit) => Promise<void>;
  clearSearchResults: () => void;
}

export const useStore = create<StoreState>((set, get) => ({
  games: [],
  gameIndex: 0,
  path: [],
  filePath: null,
  dirty: false,
  loading: false,
  error: null,
  selectedSquare: null,
  legalDests: [],
  promotionPending: null,

  libraryOpen: false,
  libraryGames: [],
  libraryHasMore: true,
  libraryLoading: false,
  indexProgress: null,
  lastAddSummary: null,
  searchResults: null,
  searchedFen: null,
  searchLoading: false,

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
      set({
        games,
        gameIndex: 0,
        path: [],
        filePath: picked,
        dirty: false,
        loading: false,
        selectedSquare: null,
        legalDests: [],
        promotionPending: null,
      });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  /** Usado pelo botão de amostra em dev (fora do Tauri não há `filePath` —
   *  salvar fica desligado, só a edição em memória é exercitável). */
  loadGames: (games) => {
    set({ games, gameIndex: 0, path: [], filePath: null, dirty: false, selectedSquare: null, legalDests: [], promotionPending: null });
  },

  selectGame: (i) =>
    set((s) => (i >= 0 && i < s.games.length ? { gameIndex: i, path: [], selectedSquare: null, legalDests: [] } : s)),

  selectPath: (p) => set({ path: p, selectedSquare: null, legalDests: [] }),
  goStart: () => set({ path: [], selectedSquare: null, legalDests: [] }),
  goPrev: () => set((s) => ({ path: prevPath(s.path), selectedSquare: null, legalDests: [] })),
  goNext: () =>
    set((s) => {
      const g = s.games[s.gameIndex];
      return g ? { path: nextPath(g, s.path), selectedSquare: null, legalDests: [] } : s;
    }),
  goEnd: () =>
    set((s) => {
      const g = s.games[s.gameIndex];
      return g ? { path: endPath(g, s.path), selectedSquare: null, legalDests: [] } : s;
    }),

  clickSquare: async (square) => {
    const s = get();
    const game = s.games[s.gameIndex];
    if (!game || s.promotionPending) return;

    if (square === s.selectedSquare) {
      set({ selectedSquare: null, legalDests: [] });
      return;
    }

    const dest = s.legalDests.find((d) => d.to === square);
    if (s.selectedSquare && dest) {
      if (dest.promotion) {
        set({ promotionPending: { from: s.selectedSquare, to: square }, selectedSquare: null, legalDests: [] });
      } else {
        await get().resolveMove(s.selectedSquare, square);
      }
      return;
    }

    const fen = fenAtPath(game, s.path);
    try {
      const dests = await be.legalMovesFrom(fen, square);
      set({ selectedSquare: dests.length > 0 ? square : null, legalDests: dests });
    } catch {
      set({ selectedSquare: null, legalDests: [] });
    }
  },

  resolvePromotion: async (role) => {
    const p = get().promotionPending;
    if (!p) return;
    set({ promotionPending: null });
    await get().resolveMove(p.from, p.to, role);
  },

  cancelPromotion: () => set({ promotionPending: null, selectedSquare: null, legalDests: [] }),

  resolveMove: async (from, to, promotion) => {
    const s = get();
    const game = s.games[s.gameIndex];
    if (!game) return;
    const fen = fenAtPath(game, s.path);
    let applied: be.AppliedMove;
    try {
      applied = await be.applyMove(fen, from, to, promotion);
    } catch (e) {
      set({ error: String(e), selectedSquare: null, legalDests: [] });
      return;
    }

    const parentPath = s.path;
    const siblingChildren = parentPath.length === 0 ? game.root : (nodeAtPath(game.root, parentPath)?.children ?? []);
    const existing = siblingChildren.findIndex((c) => c.san === applied.san);
    if (existing >= 0) {
      set({ path: [...parentPath, existing], selectedSquare: null, legalDests: [] });
      return;
    }

    const newNode: MoveNode = {
      ply: plyAtPath(game, parentPath),
      san: applied.san,
      fen: applied.fen,
      comment: null,
      nags: [],
      children: [],
    };
    const { game: newGame, path: newPath } = insertChildAtPath(game, parentPath, newNode);
    set((st) => ({
      games: st.games.map((g, i) => (i === st.gameIndex ? newGame : g)),
      path: newPath,
      dirty: true,
      selectedSquare: null,
      legalDests: [],
    }));
  },

  setComment: (text) => {
    const s = get();
    const game = s.games[s.gameIndex];
    if (!game || s.path.length === 0) return;
    const trimmed = text.trim();
    const newGame = updateNodeAtPath(game, s.path, (n) => ({ ...n, comment: trimmed ? text : null }));
    set((st) => ({ games: st.games.map((g, i) => (i === st.gameIndex ? newGame : g)), dirty: true }));
  },

  toggleNag: (nag) => {
    const s = get();
    const game = s.games[s.gameIndex];
    if (!game || s.path.length === 0) return;
    const newGame = updateNodeAtPath(game, s.path, (n) => ({
      ...n,
      nags: n.nags.includes(nag) ? n.nags.filter((x) => x !== nag) : [...n.nags, nag],
    }));
    set((st) => ({ games: st.games.map((g, i) => (i === st.gameIndex ? newGame : g)), dirty: true }));
  },

  save: async () => {
    const s = get();
    if (!s.filePath) return;
    try {
      await be.savePgnFile(s.filePath, s.games);
      set({ dirty: false });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  // --- Biblioteca ---

  initLibraryEvents: () => {
    if (!be.inTauri()) return;
    void listen<IndexProgress>("library-index-progress", (e) => set({ indexProgress: e.payload }));
  },

  toggleLibrary: () => {
    const opening = !get().libraryOpen;
    set({ libraryOpen: opening });
    if (opening && get().libraryGames.length === 0) void get().refreshLibrary();
  },

  refreshLibrary: async () => {
    if (!be.inTauri()) return;
    set({ libraryLoading: true });
    try {
      const page = await be.listLibraryGames(0, LIBRARY_PAGE);
      set({ libraryGames: page, libraryHasMore: page.length === LIBRARY_PAGE, libraryLoading: false });
    } catch (e) {
      set({ error: String(e), libraryLoading: false });
    }
  },

  loadMoreLibrary: async () => {
    const s = get();
    if (!be.inTauri() || s.libraryLoading || !s.libraryHasMore) return;
    set({ libraryLoading: true });
    try {
      const page = await be.listLibraryGames(s.libraryGames.length, LIBRARY_PAGE);
      set((st) => ({
        libraryGames: [...st.libraryGames, ...page],
        libraryHasMore: page.length === LIBRARY_PAGE,
        libraryLoading: false,
      }));
    } catch (e) {
      set({ error: String(e), libraryLoading: false });
    }
  },

  addFilesToLibrary: async () => {
    if (!be.inTauri()) return;
    const picked = await open({ multiple: true, filters: [{ name: "PGN", extensions: ["pgn"] }] });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    if (paths.length === 0) return;
    set({ indexProgress: { done: 0, total: paths.length, currentFile: "" } });
    try {
      const summary = await be.addPgnFiles(paths);
      set({ lastAddSummary: summary, indexProgress: null });
      await get().refreshLibrary();
    } catch (e) {
      set({ error: String(e), indexProgress: null });
    }
  },

  cancelAddingFiles: () => {
    void be.cancelIndexing();
  },

  removeFromLibrary: async (id) => {
    try {
      await be.removeLibraryGame(id);
      set((st) => ({ libraryGames: st.libraryGames.filter((g) => g.id !== id) }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openFromLibrary: async (id) => {
    try {
      const game = await be.openLibraryGame(id);
      set({
        games: [game],
        gameIndex: 0,
        path: [],
        filePath: null,
        dirty: false,
        selectedSquare: null,
        legalDests: [],
        promotionPending: null,
        libraryOpen: false,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  searchCurrentPosition: async () => {
    const s = get();
    const game = s.games[s.gameIndex];
    if (!game || !be.inTauri()) return;
    const fen = fenAtPath(game, s.path);
    set({ searchLoading: true, searchedFen: fen });
    try {
      const results = await be.searchPosition(fen, 50);
      set({ searchResults: results, searchLoading: false });
    } catch (e) {
      set({ error: String(e), searchLoading: false });
    }
  },

  openSearchHit: async (hit) => {
    const s = get();
    const fen = s.searchedFen;
    try {
      const game = await be.openLibraryGame(hit.gameId);
      const path = fen ? (findPathByFen(game, fen) ?? []) : [];
      set({
        games: [game],
        gameIndex: 0,
        path,
        filePath: null,
        dirty: false,
        selectedSquare: null,
        legalDests: [],
        promotionPending: null,
        searchResults: null,
        searchedFen: null,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearSearchResults: () => set({ searchResults: null, searchedFen: null }),
}));

// Dev: expõe o store pra smoke no console (fora do Tauri, ver App.tsx pro
// carregamento de amostra usado no preview do navegador).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__store = useStore;
}
