#!/usr/bin/env bash

set -euo pipefail

# ---------- configuration ----------
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/core/backend"
FRONTEND_DIR="$PROJECT_ROOT/core/frontend"
DESKTOP_DIR="$PROJECT_ROOT/desktop"
BINARIES_DIR="$DESKTOP_DIR/src-tauri/binaries"

SIDECAR_NAME="kitchenos-server"

# ---------- helper functions ----------
log() {
    echo "[package] $*"
}

error() {
    echo "[package] ERROR: $*" >&2
    exit 1
}

# ---------- check prerequisites ----------
command -v node >/dev/null 2>&1 || error "Node.js is required but not in PATH"
command -v npm >/dev/null 2>&1 || error "npm is required but not in PATH"
command -v rustc >/dev/null 2>&1 || error "Rust is required but not in PATH (install via rustup)"
command -v cargo >/dev/null 2>&1 || error "Cargo is required but not in PATH"
command -v python3 >/dev/null 2>&1 || error "Python 3 is required but not in PATH"

# ---------- detect target triple ----------
TARGET_TRIPLE=$(rustc -vV | grep "host" | awk '{print $2}')
if [ -z "$TARGET_TRIPLE" ]; then
    error "Could not detect Rust host triple. Run 'rustc -vV' manually and set TARGET_TRIPLE."
fi
log "Detected target triple: $TARGET_TRIPLE"

if [[ "$TARGET_TRIPLE" == *-windows-* ]]; then
    SIDECAR_EXE="${SIDECAR_NAME}.exe"
    SIDECAR_TRIPLE_EXE="${SIDECAR_NAME}-${TARGET_TRIPLE}.exe"
else
    SIDECAR_EXE="${SIDECAR_NAME}"
    SIDECAR_TRIPLE_EXE="${SIDECAR_NAME}-${TARGET_TRIPLE}"
fi

# ---------- build frontend ----------
log "Installing frontend dependencies..."
cd "$FRONTEND_DIR"
npm install || error "npm install failed"

log "Building frontend..."
npm run build || error "Frontend build failed"
cd "$PROJECT_ROOT"

# ---------- set up Python backend ----------
log "Setting up Python backend virtual environment..."
cd "$BACKEND_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

log "Installing Python dependencies (including pyinstaller)..."
pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-dev.txt 2>/dev/null || true   # dev deps may be optional
pip install pyinstaller

# ---------- ensure Whisper model is bundled ----------
MODEL_DIR="$BACKEND_DIR/models/small"
if [ ! -d "$MODEL_DIR" ] || [ -z "$(ls -A "$MODEL_DIR")" ]; then
    log "Whisper model not found in $MODEL_DIR. Downloading 'small' model via faster-whisper..."
    python -c "
from faster_whisper import WhisperModel
import os, shutil
from pathlib import Path
model = WhisperModel('small')
cache_dir = Path.home() / '.cache' / 'huggingface' / 'hub'
snapshots = list(cache_dir.glob('models--Systran--faster-whisper-small/snapshots/*'))
if not snapshots:
    raise RuntimeError('Model not found in cache after download')
src = snapshots[0]
dst = Path('$MODEL_DIR')
dst.mkdir(parents=True, exist_ok=True)
for f in src.iterdir():
    if f.is_file():
        shutil.copy2(f, dst / f.name)
print('Model copied to', dst)
"
    log "Model ready."
else
    log "Whisper model already present."
fi

# ---------- freeze backend with PyInstaller ----------
log "Running PyInstaller (one-file) for $SIDECAR_NAME..."
pyinstaller --onefile \
    --name "$SIDECAR_NAME" \
    --add-data "models/small:models/small" \
    run_sidecar.py

BUILT_EXE="$BACKEND_DIR/dist/$SIDECAR_EXE"
if [ ! -f "$BUILT_EXE" ]; then
    error "PyInstaller did not produce $BUILT_EXE"
fi

# ---------- copy sidecar to Tauri binaries ----------
log "Copying sidecar to $BINARIES_DIR/$SIDECAR_TRIPLE_EXE"
mkdir -p "$BINARIES_DIR"
cp "$BUILT_EXE" "$BINARIES_DIR/$SIDECAR_TRIPLE_EXE"
chmod +x "$BINARIES_DIR/$SIDECAR_TRIPLE_EXE" 2>/dev/null || true

log "Sidecar installed."

# ---------- optional: generate app icons ----------
if [ -f "$PROJECT_ROOT/icon.png" ] && [ ! -d "$DESKTOP_DIR/src-tauri/icons" ]; then
    log "Found icon.png, generating Tauri icons..."
    cd "$DESKTOP_DIR"
    npx @tauri-apps/cli icon "$PROJECT_ROOT/icon.png" || log "Icon generation failed (but you can do it manually)."
    cd "$PROJECT_ROOT"
else
    log "Skipping icon generation (no icon.png found or icons already exist)."
fi

# ---------- build Tauri app ----------
log "Building Tauri application..."
cd "$DESKTOP_DIR"
npm install   # ensure Tauri CLI and deps are installed
npm run tauri build || error "Tauri build failed"

log "Package complete! Artifacts are in $DESKTOP_DIR/src-tauri/target/release/bundle/"
cd "$PROJECT_ROOT"
