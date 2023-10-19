#!/usr/bin/env bash

set -e

export API_KEY=`cat conf/api_key`
export API_SERVER=`cat conf/api_server`
export PROJECT_ID=`cat conf/project_id`
export COMPUTE_SERVER_ID=`cat conf/compute_server_id`
export HOSTNAME=`cat conf/hostname`

mkdir -p /tmp/lower /tmp/upper /tmp/home
node ./start-filesystem.js
