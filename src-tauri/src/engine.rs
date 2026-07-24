//! Stockfish como processo separado, falando UCI por stdin/stdout — nunca
//! linkado (por isso não muda a licença do app; ver README.md). As regras
//! abaixo vêm todas de `docs/planos/localchesspgn.md` §5, medidas contra o
//! binário de verdade antes de codar:
//!
//! - **Serializar.** Nunca mandar `go` com uma busca em curso — o segundo
//!   `go` é engolido em silêncio e a engine nunca mais responde. O
//!   `Mutex<Option<EngineProc>>` resolve isso de graça: `engine_go` já
//!   precisa do lock pra falar com o processo, então dois `go` concorrentes
//!   fazem fila no próprio mutex, nunca chegam juntos no stdin.
//! - **Todo `go` leva teto de relógio** (`movetime`) E teto de profundidade
//!   (`depth`) — a dupla também é o mecanismo de dificuldade (§3: Skill
//!   Level + teto de profundidade, não `UCI_Elo`, que mede escala CCRL e não
//!   reflete força de humano).
//! - **Timeout externo.** Mesmo com `movetime`, um travamento do processo não
//!   pode prender a UI pra sempre — o `recv_timeout` do canal do stdout tem
//!   uma folga sobre o `movetime` pedido, não um valor solto.
//! - **`position` antes de todo `go`.** Sem isso a engine responde certo pro
//!   tabuleiro ERRADO, sem avisar.
//! - **Nunca repassar string do usuário direto pro stdin.** Todo FEN passa
//!   pelo `shakmaty` (via `edit::position_from_fen`) antes de virar comando
//!   UCI — FEN sintaticamente inválida derruba a engine com segfault.

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use shakmaty::fen::Fen;
use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::{EnPassantMode, Position};
use tauri::{AppHandle, Manager, State};

use crate::edit::position_from_fen;

/// Cascata de compatibilidade de CPU (§2) — tentada NESTA ordem, e só de
/// verdade: sobe o processo e espera `uciok`, não só confere que o arquivo
/// existe (existir não prova que a CPU suporta a instrução).
const VARIANTS: [&str; 3] = ["avx2", "bmi2", "sse41-popcnt"];

#[cfg(windows)]
fn bin_name(variant: &str) -> String {
    format!("stockfish-windows-x86-64-{variant}.exe")
}
#[cfg(not(windows))]
fn bin_name(variant: &str) -> String {
    format!("stockfish-ubuntu-x86-64-{variant}")
}

fn candidate_paths(app: &AppHandle, variant: &str) -> Vec<PathBuf> {
    let rel = format!("binaries/stockfish/{}", bin_name(variant));
    let mut candidates = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join(&rel));
    }
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join(&rel));
        candidates.push(res.join(format!("stockfish/{}", bin_name(variant))));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(&rel));
            candidates.push(dir.join(format!("stockfish/{}", bin_name(variant))));
        }
    }
    candidates
}

fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let _ = cmd;
}

pub(crate) struct EngineProc {
    child: Child,
    stdin: ChildStdin,
    rx: Receiver<String>,
    variant: &'static str,
}

impl Drop for EngineProc {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

#[derive(Default)]
pub struct Engine(pub Mutex<Option<EngineProc>>);

fn spawn_reader(stdout: ChildStdout) -> Receiver<String> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(l) => {
                    if tx.send(l).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        // EOF ou erro: a thread acaba, `tx` é dropado, e o próximo
        // `recv_timeout` do outro lado devolve erro (processo morto).
    });
    rx
}

/// Espera uma linha que comece com `needle`, ou desiste no timeout — os dois
/// jeitos de falhar (processo morto = canal fechado; travado = estoura o
/// prazo) caem no mesmo `false`, porque pro chamador os dois significam a
/// mesma coisa: "essa variante não serve, tenta a próxima".
fn wait_for(rx: &Receiver<String>, needle: &str, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return false;
        }
        match rx.recv_timeout(remaining) {
            Ok(line) if line.trim_start().starts_with(needle) => return true,
            Ok(_) => continue,
            Err(_) => return false,
        }
    }
}

fn try_start_variant(path: &Path, variant: &'static str) -> Option<EngineProc> {
    let mut cmd = Command::new(path);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    no_window(&mut cmd);
    let mut child = cmd.spawn().ok()?;
    let stdout = child.stdout.take()?;
    let mut stdin = child.stdin.take()?;
    let rx = spawn_reader(stdout);

    writeln!(stdin, "uci").ok()?;
    stdin.flush().ok()?;
    if !wait_for(&rx, "uciok", Duration::from_secs(3)) {
        let _ = child.kill();
        return None;
    }
    writeln!(stdin, "isready").ok()?;
    stdin.flush().ok()?;
    if !wait_for(&rx, "readyok", Duration::from_secs(3)) {
        let _ = child.kill();
        return None;
    }
    Some(EngineProc { child, stdin, rx, variant })
}

#[tauri::command]
pub fn engine_start(app: AppHandle, engine: State<Engine>) -> Result<String, String> {
    let mut guard = engine.0.lock().map_err(|_| "estado do motor corrompido".to_string())?;
    if let Some(proc) = guard.as_ref() {
        return Ok(proc.variant.to_string());
    }
    for variant in VARIANTS {
        for path in candidate_paths(&app, variant) {
            if !path.exists() {
                continue;
            }
            if let Some(proc) = try_start_variant(&path, variant) {
                let picked = proc.variant.to_string();
                *guard = Some(proc);
                return Ok(picked);
            }
        }
    }
    Err("nenhuma variante do Stockfish rodou nesta máquina (avx2/bmi2/sse41-popcnt ausentes ou incompatíveis)".to_string())
}

#[tauri::command]
pub fn engine_stop(engine: State<Engine>) {
    if let Ok(mut guard) = engine.0.lock() {
        *guard = None; // o Drop do EngineProc mata o processo
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub running: bool,
}

#[tauri::command]
pub fn engine_status(engine: State<Engine>) -> EngineStatus {
    EngineStatus { running: engine.0.lock().map(|g| g.is_some()).unwrap_or(false) }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineMove {
    pub san: String,
    pub fen: String,
    pub score_cp: Option<i32>,
    pub mate_in: Option<i32>,
}

fn extract_after<'a>(line: &'a str, marker: &str) -> Option<&'a str> {
    let i = line.find(marker)? + marker.len();
    line[i..].split_whitespace().next()
}

fn io_err(e: std::io::Error) -> String {
    format!("erro de E/S com o motor: {e}")
}

#[tauri::command]
pub fn engine_go(engine: State<Engine>, fen: String, skill_level: u8, depth: u32, movetime_ms: u32) -> Result<EngineMove, String> {
    // FEN validada ANTES de tocar o stdin — nunca repassar string crua.
    let pos = position_from_fen(&fen)?;

    let mut guard = engine.0.lock().map_err(|_| "estado do motor corrompido".to_string())?;
    let proc = guard.as_mut().ok_or_else(|| "o motor não está rodando — chame engine_start primeiro".to_string())?;

    let skill = skill_level.min(20);
    // `UCI_LimitStrength = false` garante que é o Skill Level quem manda —
    // os dois mecanismos se desligam um ao outro (§3), nunca se somam.
    writeln!(proc.stdin, "setoption name UCI_LimitStrength value false").map_err(io_err)?;
    writeln!(proc.stdin, "setoption name Skill Level value {skill}").map_err(io_err)?;
    writeln!(proc.stdin, "position fen {fen}").map_err(io_err)?;
    writeln!(proc.stdin, "go depth {depth} movetime {movetime_ms}").map_err(io_err)?;
    proc.stdin.flush().map_err(io_err)?;

    let mut score_cp = None;
    let mut mate_in = None;
    // Folga generosa sobre o movetime pedido: rede de segurança externa, não
    // o mecanismo principal (que é o `movetime` mandado pra própria engine).
    let deadline = Instant::now() + Duration::from_millis(u64::from(movetime_ms) + 5000);

    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("o motor não respondeu a tempo".to_string());
        }
        let line = match proc.rx.recv_timeout(remaining) {
            Ok(l) => l,
            Err(_) => return Err("o motor parou de responder (processo morreu?)".to_string()),
        };

        if let Some(rest) = line.strip_prefix("bestmove ") {
            let mv_str = rest.split_whitespace().next().unwrap_or("");
            if mv_str.is_empty() || mv_str == "(none)" {
                return Err("sem lance possível nesta posição (mate ou afogado)".to_string());
            }
            let uci: UciMove = mv_str.parse().map_err(|_| format!("UCI inesperado do motor: {mv_str}"))?;
            let mv = uci.to_move(&pos).map_err(|_| format!("o motor sugeriu um lance ilegal: {mv_str}"))?;
            let san = San::from_move(&pos, mv).to_string();
            let new_pos = pos.play(mv).map_err(|e| format!("lance do motor não jogou: {e:?}"))?;
            let fen_out = Fen::from_position(&new_pos, EnPassantMode::Legal).to_string();
            return Ok(EngineMove { san, fen: fen_out, score_cp, mate_in });
        }
        if line.contains(" score cp ") {
            if let Some(v) = extract_after(&line, "score cp ") {
                if let Ok(n) = v.parse() {
                    score_cp = Some(n);
                    mate_in = None;
                }
            }
        } else if line.contains(" score mate ") {
            if let Some(v) = extract_after(&line, "score mate ") {
                if let Ok(n) = v.parse() {
                    mate_in = Some(n);
                    score_cp = None;
                }
            }
        }
    }
}

/// Tabela de dificuldade — Skill Level + teto de profundidade (§3), NUNCA
/// `UCI_Elo`: essa opção mede escala CCRL (motor×motor), não FIDE/chess.com,
/// e a própria Stockfish devolve fora-de-faixa em silêncio. O rótulo mostra
/// a escala de propósito ("CCRL", não "chess.com") — a curva exata não está
/// provada (precisaria de um match de verdade, ≥200 partidas, critério de
/// aceite que fica pra depois), só o PISO está: mesmo o nível mínimo joga
/// bem demais pra ser um "1320" de humano.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Difficulty {
    pub id: &'static str,
    pub skill_level: u8,
    pub depth: u32,
    pub movetime_ms: u32,
    pub ccrl_label: &'static str,
}

const DIFFICULTIES: [Difficulty; 5] = [
    Difficulty { id: "beginner", skill_level: 0, depth: 2, movetime_ms: 300, ccrl_label: "≈1320 CCRL" },
    Difficulty { id: "casual", skill_level: 5, depth: 4, movetime_ms: 500, ccrl_label: "≈1700 CCRL" },
    Difficulty { id: "club", skill_level: 10, depth: 7, movetime_ms: 800, ccrl_label: "≈2200 CCRL" },
    Difficulty { id: "strong", skill_level: 15, depth: 11, movetime_ms: 1200, ccrl_label: "≈2700 CCRL" },
    Difficulty { id: "maximum", skill_level: 20, depth: 18, movetime_ms: 2000, ccrl_label: "≈3190 CCRL" },
];

#[tauri::command]
pub fn list_difficulties() -> Vec<Difficulty> {
    DIFFICULTIES.to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_after_finds_the_number() {
        assert_eq!(extract_after("info depth 10 score cp 34 nodes 500", "score cp "), Some("34"));
        assert_eq!(extract_after("info depth 1 score mate -3 pv e1e2", "score mate "), Some("-3"));
        assert_eq!(extract_after("bestmove e2e4", "score cp "), None);
    }

    #[test]
    fn difficulties_are_monotonic_and_never_use_uci_elo() {
        // A regra de §3: cada tier seguinte é IGUAL OU mais forte no que
        // controla força de verdade (skill+depth). Não checa UCI_Elo porque
        // esse campo nem existe aqui — a tabela inteira o evita de propósito.
        for pair in DIFFICULTIES.windows(2) {
            assert!(pair[1].skill_level >= pair[0].skill_level);
            assert!(pair[1].depth >= pair[0].depth);
        }
        assert_eq!(DIFFICULTIES[0].skill_level, 0);
        assert_eq!(DIFFICULTIES[DIFFICULTIES.len() - 1].skill_level, 20);
    }

    #[test]
    fn bin_name_matches_platform_convention() {
        // No Windows isto é literalmente o nome que os scripts fetch-stockfish
        // baixam; noutra plataforma o teste roda mas o nome muda (cfg).
        let n = bin_name("avx2");
        assert!(n.contains("avx2"));
        #[cfg(windows)]
        assert!(n.ends_with(".exe") && n.contains("windows"));
        #[cfg(not(windows))]
        assert!(!n.ends_with(".exe") && n.contains("ubuntu"));
    }
}
