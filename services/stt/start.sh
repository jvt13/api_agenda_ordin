#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
ACTIVATE="$VENV_DIR/bin/activate"

if [ -f "$BACKEND_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$BACKEND_DIR/.env"
  set +a
fi

STT_PORT="${STT_PORT:-8001}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[STT] python3 não encontrado. Instale: sudo apt install -y python3 python3-venv python3-pip ffmpeg"
  exit 1
fi

if ! python3 -m venv --help >/dev/null 2>&1; then
  echo "[STT] Módulo venv indisponível. Instale: sudo apt install -y python3-venv"
  exit 1
fi

if [ ! -f "$ACTIVATE" ]; then
  if [ -d "$VENV_DIR" ]; then
    echo "[STT] Ambiente virtual incompleto — recriando $VENV_DIR ..."
    rm -rf "$VENV_DIR"
  else
    echo "[STT] Criando ambiente virtual em $VENV_DIR ..."
  fi
  python3 -m venv "$VENV_DIR"
fi

if [ ! -f "$ACTIVATE" ]; then
  echo "[STT] Falha ao criar venv em $VENV_DIR"
  echo "[STT] Execute na VPS: sudo apt install -y python3-venv && rm -rf $VENV_DIR && bash $0"
  exit 1
fi

# shellcheck disable=SC1091
source "$ACTIVATE"

echo "[STT] Instalando dependências Python..."
pip install -q --upgrade pip
pip install -q -r "$SCRIPT_DIR/requirements.txt"

cd "$SCRIPT_DIR"
echo "[STT] Iniciando uvicorn em 0.0.0.0:${STT_PORT} (modelo=${WHISPER_MODEL:-small})"
exec uvicorn app:app --host 0.0.0.0 --port "$STT_PORT"
