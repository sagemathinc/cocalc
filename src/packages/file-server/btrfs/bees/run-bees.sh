#!/usr/bin/env bash
set -euo pipefail

# --- Inputs (env vars) ---
FS_PATH="${FS_PATH:-/fs}"                              # bind-mounted Btrfs FS root (subvol=/)
BEESHOME_NAME="${BEESHOME_NAME:-.beeshome}"            # name of bees home subvolume
HASH_TABLE_SIZE="${HASH_TABLE_SIZE:-256M}"             # e.g. 128M, 512M, 1G, 2G
MAX_CPU_PERCENT="${MAX_CPU_PERCENT:-100}"              # 1..100, for cpulimit
NICE="${NICE:-10}"                                     # 0..19
IONICE_CLASS="${IONICE_CLASS:-3}"                      # 1=rt,2=best-effort,3=idle
BEES_ARGS="${BEES_ARGS:--a}"                           # extra args to bees (e.g. "-a -v")

# Paths
HOME_DIR="${FS_PATH}/${BEESHOME_NAME}"
HASH_FILE="${HOME_DIR}/beeshash.dat"

echo "==> FS_PATH=${FS_PATH}"
echo "==> BEESHOME=${HOME_DIR}"
echo "==> HASH_TABLE_SIZE=${HASH_TABLE_SIZE}"
echo "==> MAX_CPU_PERCENT=${MAX_CPU_PERCENT} (cpulimit)"
echo "==> NICE=${NICE} IONICE_CLASS=${IONICE_CLASS}"
echo "==> BEES_ARGS=${BEES_ARGS}"

# --- Basic validation ---
if [[ ! -d "${FS_PATH}" ]]; then
  echo "ERROR: FS_PATH=${FS_PATH} does not exist (bind-mount your Btrfs filesystem to this path)." >&2
  exit 1
fi

# Check it's Btrfs
if ! btrfs filesystem show "${FS_PATH}" >/dev/null 2>&1; then
  echo "ERROR: ${FS_PATH} is not a Btrfs mount (or not visible in this container)." >&2
  exit 1
fi

# (Soft) warn if not the root subvolume (ID 5)
if btrfs subvolume show "${FS_PATH}" >/dev/null 2>&1; then
  ROOTID="$(btrfs subvolume show "${FS_PATH}" | awk '/^Subvolume ID:/ {print $3}' || true)"
  if [[ "${ROOTID:-}" != "5" ]]; then
    echo "WARN: ${FS_PATH} does not appear to be subvol=/ (ID 5). bees works best when scanning the FS root."
  fi
fi

# --- Create BEESHOME as a Btrfs subvolume if missing ---
if [[ -e "${HOME_DIR}" && ! -d "${HOME_DIR}" ]]; then
  echo "ERROR: ${HOME_DIR} exists but is not a directory." >&2
  exit 1
fi
if [[ ! -d "${HOME_DIR}" ]]; then
  echo "==> Creating bees home subvolume: ${HOME_DIR}"
  btrfs subvolume create "${HOME_DIR}"
fi

# --- Apply NoCoW (+C) on BEESHOME dir BEFORE creating the hash file ---
# If this fails (older kernels/FS options), just continue.
if command -v chattr >/dev/null 2>&1; then
  echo "==> Applying NoCoW (+C) on ${HOME_DIR} (best-effort)"
  chattr +C "${HOME_DIR}" || true
fi

# --- Create or resize the beeshash.dat file ---
if [[ ! -f "${HASH_FILE}" ]]; then
  echo "==> Creating beeshash.dat at ${HASH_FILE} (size=${HASH_TABLE_SIZE})"
  truncate -s "${HASH_TABLE_SIZE}" "${HASH_FILE}"
  chmod 700 "${HASH_FILE}"
else
  echo "==> beeshash.dat already exists at ${HASH_FILE} (leaving size unchanged)"
fi

# --- Friendly hints about memory cgroup limit (container-level) ---
MEMCG_FILE="/sys/fs/cgroup/memory.max"
if [[ -f "$MEMCG_FILE" ]]; then
  MEMMAX="$(cat "$MEMCG_FILE")"
  if [[ "$MEMMAX" == "max" ]]; then
    echo "NOTE: No memory cgroup limit set for this container. Consider --memory=${HASH_TABLE_SIZE} (or higher)."
  else
    echo "==> Container memory limit: $MEMMAX bytes"
  fi
fi

# --- Build bees command ---
export BEESHOME="${HOME_DIR}"

# Nice + ionice to be extra polite with system I/O/CPU
BEES_CMD=(nice -n "${NICE}" ionice -c "${IONICE_CLASS}" bees ${BEES_ARGS} "${FS_PATH}")

echo "==> Starting bees: ${BEES_CMD[*]}"
# cpulimit throttles the main process (coarse but effective). You can also rely on podman --cpus.
if [[ "${MAX_CPU_PERCENT}" -lt 100 ]]; then
  exec cpulimit -l "${MAX_CPU_PERCENT}" -- "${BEES_CMD[@]}"
else
  exec "${BEES_CMD[@]}"
fi
