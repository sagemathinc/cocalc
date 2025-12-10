# Useful setup on laptop:
# reflect-sync forward create root@35.212.165.34:9001 localhost:9001
# reflect-sync forward create localhost:9004 35.212.165.34:9004
# reflect-sync forward create localhost:2224 35.212.165.34:2224

export PORT=9002
export COCALC_DATA=/home/wstein/scratch/cocalc-lite/data-0
export COCALC_RUSTIC=/home/wstein/scratch/cocalc-lite/data-0/rustic
export MASTER_CONAT_SERVER=http://localhost:9001
export PROJECT_HOST_NAME=host-0
export PROJECT_HOST_REGION=west
export PROJECT_HOST_PUBLIC_URL=http://localhost:$PORT
export PROJECT_HOST_INTERNAL_URL=http://localhost:$PORT
export PROJECT_HOST_SSH_SERVER=localhost:2222
export COCALC_SSH_SERVER=localhost:2222
export COCALC_FILE_SERVER_MOUNTPOINT=/home/wstein/scratch/btrfs2/mnt/0
export PROJECT_RUNNER_NAME=0
export HOST=0.0.0.0
export COCALC_LITE_SQLITE_FILENAME=/home/wstein/build/cocalc-lite/src/packages/project-host/data-0/sqlite.db
export DEBUG='cocalc:*'
export DEBUG_CONSOLE='no'
export DEBUG_FILE=/home/wstein/build/cocalc-lite/src/packages/project-host/data-0/log
export DATA=/home/wstein/build/cocalc-lite/src/packages/project-host/data-0
export COCALC_PROJECT_BUNDLE=/home/wstein/build/cocalc-lite/src/packages/project/build/bundle

#rm -f $DEBUG_FILE

#./cocalc-project-host-0.1.4-x86_64-linux/cocalc-project-host


