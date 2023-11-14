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

export api_server=http://localhost:5000/ab3c2e56-32c4-4fa5-a3ee-6fd980d10fbf/port/5000


function setState {
  id=38
  name=$1
  state=${2:-'ready'}
  extra=${3:-''}
  timeout=${4:-0}
  progress=${5:-100}

  echo "$name is $state"
  curl -sk -u sk-RFr8mEWf8olIfXoQ00002J:  -H 'Content-Type: application/json' -d "{\"id\":$id,\"name\":\"$name\",\"state\":\"$state\",\"extra\":\"$extra\",\"timeout\":$timeout,\"progress\":$progress}" $api_server/api/v2/compute/set-detailed-state
}


setState state running

setState install configure '' 60 10

# Setup Current CoCalc Connection Configuration --
mkdir -p /cocalc/conf
echo "sk-RFr8mEWf8olIfXoQ00002J" > conf/api_key
echo "$api_server" > conf/api_server
echo "34ce85cd-b4ad-4786-a8f0-67fa9c729b4f" > conf/project_id
echo "38" > conf/compute_server_id
echo "compute-server-38" > conf/hostname

echo 'scratch' > conf/exclude_from_sync

if [ $? -ne 0 ]; then
   setState install error "problem installing configuration"
   exit 1
fi

setState install install-docker '' 120 20
setState install install-nodejs 60 50
setState install install-cocalc '' 60 70
setState install install-user '' 60 80
setState install ready '' 0  100

setState vm start '' 60 60
setState filesystem init '' 60 15
setState filesystem run '' 45 25
setState filesystem running '' 45 80

setState compute run '' 20 25
setState compute running '' 30 80

while true; do
  setState vm ready '' 35 100
  sleep 30
done