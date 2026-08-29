# Desktop build — what's scaffolded vs. what you still need to do

I wrote and reasoned through every file in this folder, but I can't compile
or run any of it from here: this sandbox has no Rust toolchain, no GUI, and
no way to produce a binary you could actually double-click. Everything below
is the part that has to happen on your own machine.

**Status: real-world tested on Linux** — packaged as a `.deb`, installed, and
launched successfully (needed a couple of `tauri.conf.json` tweaks along the
way). One real bug turned up this way and is now fixed: the build was
picking up the wrong backend port because `.env.desktop` — the file meant to
set it — wasn't actually being loaded by `vite build`. It's since been
renamed to `.env.production`, which is what `vite build`'s default mode
loads automatically; see `roadmap.md`'s Stage 0 section for the full story.
Windows/macOS packaging is still unverified.

## One-time setup (per developer machine)

1. Install Rust: https://rustup.rs
2. Install the Tauri CLI: `npm install` from this `desktop/` folder (pulls in `@tauri-apps/cli`)
3. Install PyInstaller in the `core/backend` virtualenv: `pip install pyinstaller`

## Build steps, every release

1. **Build the frontend** (Tauri does this automatically via `beforeBuildCommand`,
   but you can run it by hand to check it first):
   `npm run build --prefix ../core/frontend`

2. **Freeze the Python backend into a sidecar binary.** This is the step I
   couldn't do at all here — it needs to run once per target OS (Windows,
   macOS, Linux), on that OS:
   ```
   cd core/backend
   pyinstaller --onefile --name kitchenos-server \
     --add-data "models/small:models/small" \
     run_sidecar.py
   ```
   Tauri's sidecar naming convention requires a target-triple suffix, e.g.
   `kitchenos-server-x86_64-pc-windows-msvc.exe`. Rename PyInstaller's output
   to match (`rustc -vV` shows your triple) and copy it into
   `desktop/src-tauri/binaries/`.

   **Bundling the offline dictation model:** `--add-data` above expects a
   `core/backend/models/small/` folder to already exist — it doesn't download
   anything itself. Get it there once with:
   ```
   python -c "from faster_whisper import WhisperModel; WhisperModel('small')"
   ```
   That downloads into faster-whisper's Hugging Face cache
   (`~/.cache/huggingface/hub/models--Systran--faster-whisper-small/snapshots/<hash>/`
   on Linux/macOS, `%USERPROFILE%\.cache\...` on Windows) — copy that
   snapshot folder's *contents* (model.bin, config.json, tokenizer files) to
   `core/backend/models/small/` before running PyInstaller. This only has to
   happen once per machine you build releases from, not per release — the
   model itself doesn't change unless you deliberately upgrade it.
   `app/voice.py` picks the bundled copy up automatically via
   `KITCHENOS_WHISPER_MODEL_PATH`, which `run_sidecar.py` points at
   PyInstaller's extracted-data directory when running frozen — nothing
   else to wire up.

3. **Add app icons.** `tauri.conf.json` expects `desktop/src-tauri/icons/`
   (32x32.png, 128x128.png, 128x128@2x.png, icon.icns, icon.ico). None exist
   yet — `npx tauri icon path/to/one-source-image.png` generates the whole
   set from a single square PNG if you don't already have platform icons.

4. **Build the app**: `npm run tauri build` from `desktop/`.

## Why a Python sidecar instead of rewriting the backend in Rust

Rule 3 asks for `/core` vs `/enterprise` separation, not a rewrite — the
Flask backend in `core/backend` is already ~90% done, already SQLite-native
by default, already has the CRUD/RBAC/reports/nutrition logic this app's
value actually lives in. Rewriting that in Rust would cost weeks and buy
nothing your free-tier users would notice. A local sidecar bound to
`127.0.0.1` is a standard, supported Tauri pattern for exactly this
situation (see `tauri-plugin-shell`'s sidecar docs) and gets you shipping
now, which was the stated priority.

## Known gap I'm flagging rather than guessing at

I wrote `src/main.rs` and `tauri.conf.json` against my knowledge of the
Tauri v2 API (`tauri-plugin-shell`'s `ShellExt::sidecar`, the
`bundle.externalBin` config shape). I'm fairly confident in the shape of
this, but Tauri's plugin APIs do shift between minor versions and I have no
way to compile-check it from this sandbox. First thing to do on your end:
`npm run tauri dev` and fix whatever the compiler flags — treat this as a
reviewed first draft, not a verified one.
