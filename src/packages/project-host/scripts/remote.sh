# Useful setup on laptop:
# reflect-sync forward create root@35.212.165.34:9001 localhost:9001
# reflect-sync forward create localhost:9004 root@35.212.165.34:9004

export PORT=9004
export MASTER_CONAT_SERVER=http://localhost:9001
export PROJECT_HOST_NAME=host-2
export PROJECT_HOST_REGION=west
export PROJECT_HOST_PUBLIC_URL=http://localhost:$PORT
export PROJECT_HOST_INTERNAL_URL=http://localhost:$PORT
export PROJECT_HOST_SSH_SERVER=localhost:2224,
export COCALC_SSH_SERVER=localhost:2224,
export COCALC_FILE_SERVER_MOUNTPOINT=/mnt/btrfs
export PROJECT_RUNNER_NAME=2
export HOST=0.0.0.0
export COCALC_LITE_SQLITE_FILENAME=$HOME/project-host.db
export DEBUG='cocalc:*'
export DEBUG_CONSOLE='no'
export DEBUG_FILE=$HOME/log

./cocalc-project-host