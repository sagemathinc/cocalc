#!/bin/bash

# This is a stripped down startup script for testng mainly the state reporting.
# To really do dev with a simulated compute server, make sure to run
#    ./filesystem.sh
#    ./syncfs.sh
#    .compute.sh
# in turn in three separate terminals, after correctly figuring out the contents of the
# conf directory, based, e.g., on the on prem run script.  The api_server can be
# especially tricky to untangle when doing dev.

# NOTE: this doesn't work with the new openapi validation, so you have to do
#
#  export COCALC_DISABLE_API_VALIDATION=yes
#
# before running your hub dev server to disable that.

set -v

. env.sh

function setState {
  id=$COMPUTE_SERVER_ID
  name=$1
  state=${2:-'ready'}
  extra=${3:-''}
  timeout=${4:-0}
  progress=${5:-100}
  project_id=$PROJECT_ID

  echo "$name is $state"
  PAYLOAD="{\"id\":$id,\"name\":\"$name\",\"state\":\"$state\",\"extra\":\"$extra\",\"timeout\":$timeout,\"progress\":$progress,\"project_id\":\"$project_id\"}"
  echo $PAYLOAD
  curl -sk -u $API_KEY:  -H 'Content-Type: application/json' -d $PAYLOAD $API_SERVER/api/v2/compute/set-detailed-state
}


setState state running

sleep 0.1
setState install configure '' 60 10


setState install install-docker '' 120 20
sleep 0.1
setState install install-nodejs 60 50
sleep 0.1
setState install install-cocalc '' 60 70
sleep 0.1
setState install install-user '' 60 80
sleep 0.1
setState install ready '' 0  100

setState vm start '' 60 60
sleep 0.1

while true; do
  setState compute ready '' 35 100
  setState filesystem-sync ready '' 35 100
  setState vm ready '' 35 100
  sleep 30
done
