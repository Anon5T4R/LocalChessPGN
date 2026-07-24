import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import * as be from "../lib/backend";
import type {
  AddSummary,
  Difficulty,
  EngineMoveResult,
  GameRecord,
  IndexProgress,
  LegalDest,
  LibraryGameSummary,
  MoveNode,
  SearchHit,
} from "../lib/backend";
import { sideToMove, START_FEN } from "../lib/fen";
import {
  endPath,
  fenAtPath,
  findPathByFen,
  insertChildAtPath,
  nextPath,
  nodeAtPath,
  nextPlyFrom,
  prevPath,
  type Path,
  updateNodeAtPath,
} from "../lib/tree";

const LIBRARY_PAGE = 30;
/** Consultar não tem "dificuldade" — é sempre a resposta mais forte que dá
 *  pra esperar numa UI (não o máximo absoluto, que estouraria o tempo de
 *  espera aceitável pra um clique). */
const CONSULT_SKILL = 20;
const CONSULT_DEPTH = 16;
const CONSULT_MOVETIME_MS = 1000;

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

  // --- Motor (F4/F5) ---
  difficulties: Difficulty[];
  engineRunning: boolean;
  engineStarting: boolean;
  consulting: boolean;
  consultResult: EngineMoveResult | null;
  playMode: { playerColor: "w" | "b"; difficultyId: string } | null;
  engineThinking: boolean;

  initEngine: () => Promise<void>;
  /** Interno — mesma nota do `resolveMove`/`commitMove` sobre não esconder
   *  do tipo por causa da checagem de propriedade excedente do zustand. */
  ensureEngineStarted: () => Promise<boolean>;
  commitMove: (applied: { san: string; fen: string }) => void;
  consultEngine: () => Promise<void>;
  playSuggestedMove: () => void;
  clearConsult: () => void;
  startPlaying: (playerColor: "w" | "b", difficultyId: string) => Promise<void>;
  stopPlaying: () => void;
  maybeEngineRespond: () => Promise<void>;
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

  difficulties: [],
  engineRunning: false,
  engineStarting: false,
  consulting: false,
  consultResult: null,
  playMode: null,
  engineThinking: false,

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
    if (!game || s.promotionPending || s.engineThinking) return;

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
    get().commitMove(applied);
    void get().maybeEngineRespond();
  },

  /** Insere (ou navega até, se já existir) um lance {san,fen} no caminho
   *  atual — usado tanto por um lance clicado (F2) quanto por um lance do
   *  motor (F5): pro resto da árvore, os dois são a mesma coisa. */
  commitMove: (applied) => {
    const s = get();
    const game = s.games[s.gameIndex];
    if (!game) return;
    const parentPath = s.path;
    const siblingChildren = parentPath.length === 0 ? game.root : (nodeAtPath(game.root, parentPath)?.children ?? []);
    const existing = siblingChildren.findIndex((c) => c.san === applied.san);
    if (existing >= 0) {
      set({ path: [...parentPath, existing], selectedSquare: null, legalDests: [] });
      return;
    }

    const newNode: MoveNode = {
      ply: nextPlyFrom(game, parentPath),
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

  // --- Motor ---

  initEngine: async () => {
    if (!be.inTauri()) return;
    try {
      const diffs = await be.listDifficulties();
      set({ difficulties: diffs });
    } catch {
      // sem lista de dificuldade a UI de "jogar contra"/"consultar" só não
      // aparece — não é erro pro usuário ver, o app segue leitor+editor normal.
    }
  },

  ensureEngineStarted: async () => {
    const s = get();
    if (s.engineRunning) return true;
    set({ engineStarting: true });
    try {
      await be.engineStart();
      set({ engineRunning: true, engineStarting: false });
      return true;
    } catch (e) {
      set({ error: String(e), engineStarting: false });
      return false;
    }
  },

  consultEngine: async () => {
    const s = get();
    const game = s.games[s.gameIndex];
    if (!game || !be.inTauri()) return;
    const ok = await get().ensureEngineStarted();
    if (!ok) return;
    set({ consulting: true, consultResult: null });
    const fen = fenAtPath(game, s.path);
    try {
      const result = await be.engineGo(fen, CONSULT_SKILL, CONSULT_DEPTH, CONSULT_MOVETIME_MS);
      set({ consultResult: result, consulting: false });
    } catch (e) {
      set({ error: String(e), consulting: false });
    }
  },

  playSuggestedMove: () => {
    const r = get().consultResult;
    if (!r) return;
    get().commitMove(r);
    set({ consultResult: null });
  },

  clearConsult: () => set({ consultResult: null }),

  startPlaying: async (playerColor, difficultyId) => {
    const ok = await get().ensureEngineStarted();
    if (!ok) return;
    // "Jogar contra" sempre começa uma partida NOVA — não é edição do que
    // já estava aberto.
    const fresh: GameRecord = {
      headers: [
        ["White", playerColor === "w" ? "Você" : "Stockfish"],
        ["Black", playerColor === "b" ? "Você" : "Stockfish"],
      ],
      startFen: START_FEN,
      startPly: 1,
      root: [],
      result: null,
      preambleComment: null,
      error: null,
    };
    set({
      games: [fresh],
      gameIndex: 0,
      path: [],
      filePath: null,
      dirty: false,
      selectedSquare: null,
      legalDests: [],
      promotionPending: null,
      consultResult: null,
      searchResults: null,
      playMode: { playerColor, difficultyId },
    });
    await get().maybeEngineRespond();
  },

  stopPlaying: () => set({ playMode: null }),

  maybeEngineRespond: async () => {
    const s = get();
    const pm = s.playMode;
    const game = s.games[s.gameIndex];
    if (!pm || !game || s.engineThinking) return;
    const fen = fenAtPath(game, s.path);
    if (sideToMove(fen) === pm.playerColor) return; // vez do jogador
    const diff = s.difficulties.find((d) => d.id === pm.difficultyId) ?? s.difficulties[0];
    if (!diff) return;
    set({ engineThinking: true });
    try {
      const result = await be.engineGo(fen, diff.skillLevel, diff.depth, diff.movetimeMs);
      get().commitMove(result);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ engineThinking: false });
    }
  },
}));

// Dev: expõe o store pra smoke no console (fora do Tauri, ver App.tsx pro
// carregamento de amostra usado no preview do navegador).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__store = useStore;
}
