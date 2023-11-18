#!/bin/bash

# This is a stripped down startup script for testng mainly the state reporting.
# To really do dev with a simulated compute server, make sure to run
#    ./filesystem.sh
#    ./syncfs.sh
#    .compute.sh
# in turn in three separate terminals, after correctly figuring out the contents of the
# conf directory, based, e.g., on the on prem run script.  The api_server can be
# especially tricky to untangle when doing dev.

set -v

export api_server=`cat conf/api_server`


function setState {
  id=`cat conf/compute_server_id`
  name=$1
  state=${2:-'ready'}
  extra=${3:-''}
  timeout=${4:-0}
  progress=${5:-100}

  echo "$name is $state"
  curl -sk -u `cat conf/api_key`:  -H 'Content-Type: application/json' -d "{\"id\":$id,\"name\":\"$name\",\"state\":\"$state\",\"extra\":\"$extra\",\"timeout\":$timeout,\"progress\":$progress}" $api_server/api/v2/compute/set-detailed-state
}


setState state running

sleep 1
setState install configure '' 60 10


setState install install-docker '' 120 20
sleep 1
setState install install-nodejs 60 50
sleep 1
setState install install-cocalc '' 60 70
sleep 1
setState install install-user '' 60 80
sleep 1
setState install ready '' 0  100

setState vm start '' 60 60
sleep 1

while true; do
  setState vm ready '' 35 100
  sleep 30
done