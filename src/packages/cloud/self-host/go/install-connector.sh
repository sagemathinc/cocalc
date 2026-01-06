#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  install-connector.sh --base-url <url> --token <pairing_token> [options]

Options:
  --name <name>                Optional connector name.
  --replace                    Allow replacing an existing connector config.
  --check                      Run multipass sanity check before polling.
  --no-daemon                  Run in foreground (default is daemon).
  --software-base-url <url>    Defaults to https://software.cocalc.ai/software
  --install-dir <path>         Linux install dir (default /usr/local/bin).
  -h, --help                   Show this help.

Example:
  curl -fsSL https://software.cocalc.ai/software/self-host/install.sh | \
    bash -s -- --base-url https://dev.cocalc.ai --token <token> --name my-mac
USAGE
}

BASE_URL=""
TOKEN=""
NAME_ARG=""
REPLACE="0"
CHECK="0"
DAEMON="1"
SOFTWARE_BASE_URL="https://software.cocalc.ai/software"
INSTALL_DIR="/usr/local/bin"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --token)
      TOKEN="${2:-}"
      shift 2
      ;;
    --name)
      NAME_ARG="${2:-}"
      shift 2
      ;;
    --replace)
      REPLACE="1"
      shift
      ;;
    --check)
      CHECK="1"
      shift
      ;;
    --no-daemon)
      DAEMON="0"
      shift
      ;;
    --software-base-url)
      SOFTWARE_BASE_URL="${2:-}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$BASE_URL" || -z "$TOKEN" ]]; then
  echo "Missing --base-url or --token" >&2
  usage
  exit 2
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 2
fi

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64|amd64)
    ARCH="amd64"
    ;;
  arm64|aarch64)
    ARCH="arm64"
    ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 2
    ;;
esac

case "$OS" in
  linux)
    ;;
  darwin)
    if [[ "$ARCH" != "arm64" ]]; then
      echo "Only darwin/arm64 is supported right now." >&2
      exit 2
    fi
    ;;
  *)
    echo "Unsupported OS: $OS" >&2
    exit 2
    ;;
esac

SOFTWARE_BASE_URL="${SOFTWARE_BASE_URL%/}"
LATEST_URL="${SOFTWARE_BASE_URL}/self-host/latest-${OS}-${ARCH}.json"

json="$(curl -fsSL "$LATEST_URL")"
url="$(printf '%s' "$json" | sed -n 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
sha256="$(printf '%s' "$json" | sed -n 's/.*"sha256"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

if [[ -z "$url" || -z "$sha256" ]]; then
  echo "Failed to parse latest manifest from $LATEST_URL" >&2
  exit 2
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

artifact="$tmp_dir/$(basename "$url")"
curl -fsSL "$url" -o "$artifact"

sha_cmd=""
if command -v sha256sum >/dev/null 2>&1; then
  sha_cmd="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  sha_cmd="shasum -a 256"
fi

if [[ -n "$sha_cmd" ]]; then
  actual="$($sha_cmd "$artifact" | awk '{print $1}')"
  if [[ "$actual" != "$sha256" ]]; then
    echo "SHA256 mismatch for $artifact" >&2
    exit 2
  fi
else
  echo "sha256 tool not found; skipping verification" >&2
fi

BIN_NAME="cocalc-self-host-connector"
BIN_PATH=""
SUDO=""

if [[ "$OS" == "darwin" ]]; then
  if [[ "$artifact" != *.pkg ]]; then
    echo "Expected pkg for macOS but got $artifact" >&2
    exit 2
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required to install the pkg on macOS." >&2
    exit 2
  fi
  sudo installer -pkg "$artifact" -target /
  BIN_PATH="/usr/local/bin/${BIN_NAME}"
else
  if [[ -w "$INSTALL_DIR" ]]; then
    SUDO=""
  elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
    SUDO=""
  fi
  $SUDO mkdir -p "$INSTALL_DIR"
  $SUDO install -m 0755 "$artifact" "$INSTALL_DIR/${BIN_NAME}"
  BIN_PATH="${INSTALL_DIR}/${BIN_NAME}"
fi

if [[ ! -x "$BIN_PATH" ]]; then
  BIN_PATH="$(command -v "$BIN_NAME" || true)"
fi

if [[ -z "$BIN_PATH" || ! -x "$BIN_PATH" ]]; then
  echo "Connector binary not found after install." >&2
  exit 2
fi

pair_args=("$BIN_PATH" "pair" "--base-url" "$BASE_URL" "--token" "$TOKEN")
if [[ -n "$NAME_ARG" ]]; then
  pair_args+=("--name" "$NAME_ARG")
fi
if [[ "$REPLACE" == "1" ]]; then
  pair_args+=("--replace")
fi
"${pair_args[@]}"

run_args=("$BIN_PATH" "run")
if [[ "$CHECK" == "1" ]]; then
  run_args+=("--check")
fi
if [[ "$DAEMON" == "1" ]]; then
  run_args+=("--daemon")
fi
"${run_args[@]}"

echo "Connector installed and running."
