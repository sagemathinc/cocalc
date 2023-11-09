#!/usr/bin/env bash

unset COCALC_PROJECT_ID
export API_KEY=`cat conf/api_key`
export API_SERVER=`cat conf/api_server`
export PROJECT_ID=`cat conf/project_id`
export COMPUTE_SERVER_ID=`cat conf/compute_server_id`
export HOSTNAME=`cat conf/hostname`
export UNIONFS_UPPER=/tmp/upper
export UNIONFS_LOWER=/tmp/lower
export PROJECT_HOME=/tmp/home
export READ_TRACKING_PATH=/tmp/reads
export EXCLUDE_FROM_SYNC="tmp|"

echo API_KEY=$API_KEY
echo API_SERVER=$API_SERVER
echo PROJECT_ID=$PROJECT_ID
echo COMPUTE_SERVER_ID=$COMPUTE_SERVER_ID
echo HOSTNAME=$HOSTNAME
echo UNIONFS_UPPER=$UNIONFS_UPPER
echo UNIONFS_LOWER=$UNIONFS_LOWER
echo PROJECT_HOME=$PROJECT_HOME
echo READ_TRACKING_PATH=$READ_TRACKING_PATH
