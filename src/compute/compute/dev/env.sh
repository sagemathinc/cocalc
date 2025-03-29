#!/usr/bin/env bash

unset NATS_SERVER
unset COCALC_NATS_SERVER
unset COCALC_PROJECT_ID
unset COCALC_USERNAME

export API_KEY=`cat conf/api_key`
export API_SERVER=`cat conf/api_server`
export PROJECT_ID=`cat conf/project_id`
export COMPUTE_SERVER_ID=`cat conf/compute_server_id`
export HOSTNAME=`cat conf/hostname`
export UNIONFS_UPPER=/tmp/upper5002
export UNIONFS_LOWER=/tmp/lower5002
export PROJECT_HOME=/tmp/home5002
export READ_TRACKING_FILE=/tmp/reads5002
export METADATA_FILE=$UNIONFS_LOWER/.compute-servers/$COMPUTE_SERVER_ID/meta/meta.lz4
export EXCLUDE_FROM_SYNC=`cat conf/exclude_from_sync`

echo API_KEY=$API_KEY
echo API_SERVER=$API_SERVER
echo PROJECT_ID=$PROJECT_ID
echo COMPUTE_SERVER_ID=$COMPUTE_SERVER_ID
echo HOSTNAME=$HOSTNAME
echo UNIONFS_UPPER=$UNIONFS_UPPER
echo UNIONFS_LOWER=$UNIONFS_LOWER
echo PROJECT_HOME=$PROJECT_HOME
echo READ_TRACKING_FILE=$READ_TRACKING_FILE
echo METADATA_FILE=$METADATA_FILE

mkdir -p $UNIONFS_UPPER
mkdir -p $UNIONFS_LOWER
mkdir -p $PROJECT_HOME
