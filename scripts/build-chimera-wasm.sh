#!/usr/bin/env bash
# Rebuild the CHIMERA vocal engine that The Canticle performs with.
#
# The game ships the compiled wasm (public/chimera/chimera.wasm) so its own build
# stays plain JavaScript and GitHub Pages needs no Rust toolchain. Run this only
# when you want to move to a newer engine.
#
#   scripts/build-chimera-wasm.sh                 # the pinned commit below
#   CHIMERA_REF=main scripts/build-chimera-wasm.sh
#
# Needs: rustup (with the wasm32-unknown-unknown target — this script adds it),
# git and network access to clone the MIT-licensed engine.
set -euo pipefail

CHIMERA_REPO="${CHIMERA_REPO:-https://github.com/jamesondh/chimera-vocal-synth.git}"
# Pinned engine commit: the build the game's lyrics and tuning were verified against.
CHIMERA_REF="${CHIMERA_REF:-186b75a1a8cf22017f68cd8acac8015d29cbf437}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ROOT}/.build/chimera-src"
TARGET="${ROOT}/.build/chimera-target"
OUT="${ROOT}/public/chimera/chimera.wasm"

# Keep every download inside the repo so the build works in a sandboxed checkout.
export RUSTUP_HOME="${RUSTUP_HOME:-$ROOT/.rustup}"
export CARGO_HOME="${CARGO_HOME:-$ROOT/.cargo}"
export CARGO_TARGET_DIR="$TARGET"
RUSTUP="${RUSTUP_BIN:-$HOME/.cargo/bin/rustup}"
if [ ! -x "$RUSTUP" ]; then
  echo "rustup not found at $RUSTUP (set RUSTUP_BIN)" >&2
  exit 1
fi
if [ ! -d "$RUSTUP_HOME/toolchains" ]; then
  echo "==> installing a minimal Rust toolchain into .rustup"
  "$RUSTUP" toolchain install stable --profile minimal --no-self-update
fi
"$RUSTUP" target add wasm32-unknown-unknown >/dev/null 2>&1 || true
CARGO="$("$RUSTUP" which cargo)"
# The toolchain's own rustc must win over any other rust in PATH (it carries the wasm std).
export PATH="$(dirname "$CARGO"):$PATH"

if [ ! -d "$WORK/.git" ]; then
  echo "==> cloning $CHIMERA_REPO"
  git clone --quiet "$CHIMERA_REPO" "$WORK"
fi
git -C "$WORK" fetch --quiet origin
git -C "$WORK" checkout --quiet "$CHIMERA_REF"

echo "==> building chimera-wasm ($CHIMERA_REF)"
(cd "$WORK" && "$CARGO" build -p chimera-wasm --release --target wasm32-unknown-unknown --manifest-path "$WORK/Cargo.toml")

mkdir -p "$(dirname "$OUT")"
cp "$TARGET/wasm32-unknown-unknown/release/chimera_wasm.wasm" "$OUT"
echo "==> wrote ${OUT#$ROOT/} ($(wc -c < "$OUT" | tr -d ' ') bytes)"
echo "    Next: node scripts/build-canticle-lyrics.mjs   (only if a lyric line changed)"
