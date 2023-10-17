#!/usr/bin/env bash

set -e

export API_KEY=`cat conf/api_key`
export API_SERVER=`cat conf/api_server`
export PROJECT_ID=`cat conf/project_id`
export COMPUTE_SERVER_ID=`cat conf/compute_server_id`
export HOSTNAME=`cat conf/hostname`

echo API_KEY=$API_KEY
echo API_SERVER=$API_SERVER
echo PROJECT_ID=$PROJECT_ID
echo COMPUTE_SERVER_ID=$COMPUTE_SERVER_ID
echo HOSTNAME=$HOSTNAME

node ./start.js
