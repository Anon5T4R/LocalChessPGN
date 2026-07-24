# Baixa as 3 variantes Windows do Stockfish 18 (avx2/bmi2/sse41-popcnt) do
# espelho da suite e instala em src-tauri/binaries/stockfish. As 3 ficam
# juntas de proposito: a maquina do usuario pode nao suportar AVX2/BMI2, e a
# cascata de compatibilidade (tentar avx2 -> bmi2 -> sse41-popcnt em tempo de
# execucao) e decisao do plano (docs/planos/localchesspgn.md secao 2).
# Uso: powershell -ExecutionPolicy Bypass -File scripts/fetch-stockfish.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ---------------------------------------------------------------------------
# VERSAO FIXA + SHA256 (2026-07-20) — mesma politica do fetch-ffmpeg: nunca
# `latest`, tag fixa (`sf_18`) e hash conferido ANTES de extrair. Os sha256
# abaixo batem com o "digest" que o proprio GitHub reporta pra cada asset
# (conferido via `gh api .../releases/tags/v1`), nao so com o que o espelho
# registrou no MANIFEST.json.
# PRA ATUALIZAR: nova tag do stockfish, baixar as 6 variantes (3 Windows + 3
# Linux), sha256sum, trocar as constantes aqui E no .sh, sempre juntos.
# ---------------------------------------------------------------------------
$sfUpstreamTag = "sf_18"
$variants = @(
    @{ Name = "avx2";         Asset = "stockfish-windows-x86-64-avx2.zip";         Sha256 = "6f6c272ebd6ea594377715235c8a7326f75940ef4f4f856f45106028fe6ae900" },
    @{ Name = "bmi2";         Asset = "stockfish-windows-x86-64-bmi2.zip";         Sha256 = "c0b06a547deb261bf35456773155354b00b228ef853c51dcedbbb7c580477ece" },
    @{ Name = "sse41-popcnt"; Asset = "stockfish-windows-x86-64-sse41-popcnt.zip"; Sha256 = "f25830a4567e2bac843d029d3113e6e34ba0cd2f95b9c0bb49afc871fe722a10" }
)

$root = Split-Path -Parent $PSScriptRoot
$sfDir = Join-Path $root "src-tauri\binaries\stockfish"
New-Item -ItemType Directory -Force -Path $sfDir | Out-Null

$allPresent = $true
foreach ($v in $variants) {
    $exe = Join-Path $sfDir "stockfish-windows-x86-64-$($v.Name).exe"
    if (-not (Test-Path $exe)) { $allPresent = $false }
}
if ($allPresent -and (Test-Path (Join-Path $sfDir "LICENSE-stockfish.txt"))) {
    Write-Host "stockfish (3 variantes) ja existe em $sfDir"
    exit 0
}

foreach ($v in $variants) {
    $exeName = "stockfish-windows-x86-64-$($v.Name).exe"
    $destExe = Join-Path $sfDir $exeName
    if (Test-Path $destExe) {
        Write-Host "$exeName ja existe, pulando"
        continue
    }

    $url = "https://github.com/Anon5T4R/Local-runtimes/releases/download/v1/$($v.Asset)"
    Write-Host "Baixando $url ..."
    $zip = Join-Path $env:TEMP $v.Asset
    Invoke-WebRequest -Uri $url -OutFile $zip

    $got = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLower()
    if ($got -ne $v.Sha256) {
        Remove-Item $zip -Force
        throw "SHA256 NAO BATE em $($v.Asset)!`n  esperado: $($v.Sha256)`n  recebido: $got`nDownload corrompido ou adulterado. Nada foi instalado."
    }
    Write-Host "sha256 conferido: $got"

    $extract = Join-Path $env:TEMP "stockfish-extract-$($v.Name)"
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    Remove-Item $zip -Force

    $hit = Get-ChildItem -Path $extract -Recurse -Filter $exeName | Select-Object -First 1
    if (-not $hit) { throw "$exeName nao encontrado dentro do zip" }
    Copy-Item $hit.FullName -Destination $destExe -Force

    if (-not (Test-Path (Join-Path $sfDir "LICENSE-stockfish.txt"))) {
        $lic = Get-ChildItem -Path $extract -Recurse -Filter "Copying.txt" | Select-Object -First 1
        if (-not $lic) { throw "Copying.txt nao encontrado dentro do zip — nao e possivel redistribuir o Stockfish sem ele" }
        Copy-Item $lic.FullName -Destination (Join-Path $sfDir "LICENSE-stockfish.txt") -Force
    }

    Remove-Item $extract -Recurse -Force
}

# ---------------------------------------------------------------------------
# CONFORMIDADE DE LICENCA — mesmo raciocinio do ffmpeg: o Stockfish e
# GPL-3.0-or-later e roda como PROCESSO SEPARADO (protocolo UCI por
# stdin/stdout), entao nao ha linkagem — e agregacao no mesmo instalador.
# ---------------------------------------------------------------------------
$fonte = @"
Stockfish — binario de terceiro redistribuido com o LocalChessPGN
============================================================

O Stockfish que acompanha este instalador (3 variantes: avx2/bmi2/sse41-popcnt,
escolhidas em cascata conforme o suporte da CPU) e uma build NAO MODIFICADA
oficial, licenciada sob a GNU General Public License versao 3 ou posterior. O
texto completo da licenca esta em LICENSE-stockfish.txt, nesta mesma pasta.

O Stockfish roda como PROCESSO SEPARADO, falando o protocolo UCI por
stdin/stdout. O codigo do LocalChessPGN nao faz linkagem com ele: as duas obras
sao apenas agregadas no mesmo instalador. (Quem torna o LocalChessPGN GPL-3 e
outra coisa: o `shakmaty`/`pgn-reader`, que SAO linkados — ver README.md.)

Procedencia exata desta copia
-----------------------------
  tag do upstream ... $sfUpstreamTag
  espelho ........... https://github.com/Anon5T4R/Local-runtimes (release v1)
  fonte do Stockfish . https://github.com/official-stockfish/Stockfish

Oferta de codigo-fonte (GPL-3.0, secao 6)
-----------------------------------------
O codigo-fonte correspondente esta publicamente disponivel no endereco acima,
na tag $sfUpstreamTag. Se preferir receber por outro meio, abra uma issue em
https://github.com/Anon5T4R/LocalChessPGN e ele sera fornecido.
"@
Set-Content -Path (Join-Path $sfDir "FONTE-STOCKFISH.txt") -Value $fonte -Encoding UTF8

Write-Host "Instalado em $sfDir (3 variantes + LICENSE-stockfish.txt e FONTE-STOCKFISH.txt)"
