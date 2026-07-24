#!/usr/bin/env bash
# Baixa as 3 variantes Linux do Stockfish 18 (avx2/bmi2/sse41-popcnt) do
# espelho da suíte e instala em src-tauri/binaries/stockfish. As 3 ficam
# juntas de propósito: a cascata de compatibilidade (avx2 -> bmi2 ->
# sse41-popcnt em tempo de execução) é decisão do plano (§2 do
# docs/planos/localchesspgn.md).
# Uso: bash scripts/fetch-stockfish.sh
set -euo pipefail

# ---------------------------------------------------------------------------
# VERSÃO FIXA + SHA256 (2026-07-20) — ver o comentário longo no
# fetch-stockfish.ps1. PRA ATUALIZAR: trocar as constantes aqui E no .ps1,
# sempre juntos.
# ---------------------------------------------------------------------------
SF_UPSTREAM_TAG="sf_18"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SF_DIR="$ROOT/src-tauri/binaries/stockfish"
mkdir -p "$SF_DIR"

fetch_variant() {
  local name="$1" asset="$2" sha256="$3"
  local bin_name="stockfish-ubuntu-x86-64-$name"
  local dest="$SF_DIR/$bin_name"

  if [ -f "$dest" ]; then
    echo "$bin_name já existe, pulando"
    return
  fi

  local url="https://github.com/Anon5T4R/Local-runtimes/releases/download/v1/$asset"
  echo "Baixando $url ..."
  curl -fsSL --retry 3 --retry-delay 2 "$url" -o "/tmp/$asset"

  local got
  got=$(sha256sum "/tmp/$asset" | cut -d' ' -f1)
  if [ "$got" != "$sha256" ]; then
    rm -f "/tmp/$asset"
    echo "SHA256 NAO BATE em $asset!" >&2
    echo "  esperado: $sha256" >&2
    echo "  recebido: $got" >&2
    echo "Download corrompido ou adulterado. Nada foi instalado." >&2
    exit 1
  fi
  echo "sha256 conferido: $got"

  local extract="/tmp/stockfish-extract-$name"
  rm -rf "$extract"
  mkdir -p "$extract"
  tar -xf "/tmp/$asset" -C "$extract"

  local hit
  hit=$(find "$extract" -type f -name "$bin_name" | head -1)
  [ -z "$hit" ] && { echo "$bin_name não encontrado no tarball"; exit 1; }
  cp "$hit" "$dest"
  chmod +x "$dest"

  if [ ! -f "$SF_DIR/LICENSE-stockfish.txt" ]; then
    local lic
    lic=$(find "$extract" -type f -name "Copying.txt" | head -1)
    [ -z "$lic" ] && { echo "Copying.txt não encontrado no tarball — não é possível redistribuir o Stockfish sem ele"; exit 1; }
    cp "$lic" "$SF_DIR/LICENSE-stockfish.txt"
  fi

  rm -f "/tmp/$asset"
  rm -rf "$extract"
}

fetch_variant "avx2"         "stockfish-ubuntu-x86-64-avx2.tar"         "536c0c2c0cf06450df0bfb5e876ef0d3119950703a8f143627f990c7b5417964"
fetch_variant "bmi2"         "stockfish-ubuntu-x86-64-bmi2.tar"         "7b200a3cd8ae6e2b07386cd213058edc91faf05ff77db68604d2f5143c56b69e"
fetch_variant "sse41-popcnt" "stockfish-ubuntu-x86-64-sse41-popcnt.tar" "dea5016a6d9ab705e5697b093d882fca4677d84d8828f470ee33e76de33cf962"

# ---------------------------------------------------------------------------
# CONFORMIDADE DE LICENÇA — mesmo raciocínio do ffmpeg: o Stockfish é
# GPL-3.0-or-later e roda como PROCESSO SEPARADO (protocolo UCI por
# stdin/stdout), então não há linkagem — é agregação no mesmo instalador.
# ---------------------------------------------------------------------------
cat > "$SF_DIR/FONTE-STOCKFISH.txt" <<EOF
Stockfish — binário de terceiro redistribuído com o LocalChessPGN
============================================================

O Stockfish que acompanha este instalador (3 variantes: avx2/bmi2/sse41-popcnt,
escolhidas em cascata conforme o suporte da CPU) é uma build NÃO MODIFICADA
oficial, licenciada sob a GNU General Public License versão 3 ou posterior. O
texto completo da licença está em LICENSE-stockfish.txt, nesta mesma pasta.

O Stockfish roda como PROCESSO SEPARADO, falando o protocolo UCI por
stdin/stdout. O código do LocalChessPGN não faz linkagem com ele: as duas obras
são apenas agregadas no mesmo instalador. (Quem torna o LocalChessPGN GPL-3 é
outra coisa: o \`shakmaty\`/\`pgn-reader\`, que SÃO linkados — ver README.md.)

Procedência exata desta cópia
-----------------------------
  tag do upstream ... $SF_UPSTREAM_TAG
  espelho ........... https://github.com/Anon5T4R/Local-runtimes (release v1)
  fonte do Stockfish . https://github.com/official-stockfish/Stockfish

Oferta de código-fonte (GPL-3.0, seção 6)
-----------------------------------------
O código-fonte correspondente está publicamente disponível no endereço acima,
na tag $SF_UPSTREAM_TAG. Se preferir receber por outro meio, abra uma issue em
https://github.com/Anon5T4R/LocalChessPGN e ele será fornecido.
EOF

echo "Instalado em $SF_DIR (3 variantes + LICENSE-stockfish.txt e FONTE-STOCKFISH.txt)"
