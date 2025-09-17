#!/usr/bin/env bash
# dbclient wrapper so we can use Mutagen with Dropbear's ssh client.
# Place this as "ssh" in a directory and point MUTAGEN_SSH_PATH at that
# **DIRECTORY** (not the actual file)..
# Requires dbclient in $PATH (or adjust DBCLIENT below).

set -euo pipefail
DBCLIENT="${DBCLIENT:-dbclient}"

args=()
user=""
host=""
port=""
identity_files=()
remote_cmd=()
saw_command=0

while (( "$#" )); do
  case "$1" in
    -p) port="$2"; shift 2;;
    -l) user="$2"; shift 2;;
    -i) identity_files+=("$2"); shift 2;;
    -T|-t|-N|-A|-v|-q) args+=("$1"); shift;;
    -o)
      opt="$2"
      case "$opt" in
        BatchMode=*|ExitOnForwardFailure=*|UserKnownHostsFile=*|GlobalKnownHostsFile=*|StrictHostKeyChecking=*|LogLevel=*|ConnectTimeout=*)
          args+=("-o" "$opt")
          ;;
        ProxyCommand=*)
          # Map to dbclient -J
          args+=("-J" "${opt#ProxyCommand=}")
          ;;
        *)
          echo "ssh-dbclient wrapper: ignoring unsupported -o $opt" >&2
          ;;
      esac
      shift 2;;
    --) shift; remote_cmd=("$@"); break;;
    -*)
      # Unknown flag, warn and drop
      echo "ssh-dbclient wrapper: ignoring unsupported flag $1" >&2
      shift;;
    *)
      if [[ -z "$host" ]]; then
        host="$1"
        shift
      else
        saw_command=1
        remote_cmd+=("$@")
        break
      fi
      ;;
  esac
done

# Build target
dest="$host"
[[ -n "$user" ]] && dest="$user@$dest"
[[ -n "$port" ]] && dest="${dest}^${port}"

cmd=("$DBCLIENT")
for k in "${identity_files[@]}"; do
  cmd+=(-i "$k")
done

# Add no-tty if we’re running a command (Mutagen agent case)
if [[ $saw_command -eq 1 || ${#remote_cmd[@]} -gt 0 ]]; then
  cmd+=(-T)
fi

cmd+=("${args[@]}" "$dest")
[[ ${#remote_cmd[@]} -gt 0 ]] && cmd+=("${remote_cmd[@]}")

exec "${cmd[@]}"
