#!/bin/bash

# Clean up extra processes after mocha run.
# Kill python process trees spawned by "if DEV"
# part around line 90 of src/smc-hub/compute-server.coffee.

# Below is an example of the processes we want to kill after a mocha api run.
# Each one spawns 16 or so child processes and we need to kill them too.
#
# python \
#   /projects/23cf4733-a1c3-495d-9700-afd4f8e3e544/smc/src/smc_pyutil/smc_pyutil/smc_compute.py \
#   --dev \
#   --projects /tmp/projects-test-117000-99942-djjjyz.tf8apnbv29 start \
#   --base_url  fcbee6ea-5262-4bce-8450-a5b6d8038083

# sample use:
# ~/cocalc/src/smc-hub$ mocha test/api
# ...
# 90 passing (35s)
# 1 pending
# ~/cocalc/src/smc-hub$ mocha_clean.sh
# process count 28 -> 8
# memory use 966MB -> 393MB


my_mem () {
  ps -U `whoami` --no-headers -o rss | awk '{ sum+=$1} END {print int(sum/1024) "MB"}'
}

my_pid_count () {
  echo $(( `ps -a | wc -l` - 3 ))
}

before_count=`my_pid_count`
before_mem=`my_mem`

# get pid(s) of test compute server processes
# these are parents of subtrees that are left behind
cspids=`pgrep -f "python.*--dev"`

[[ $cspids ]] && {
  for cspid in $cspids
  do
    # get pids under each smc_compute --dev process, typically 18 for each
    # don't need to kill threads explicitly
    # kill in reverse order, from lowest-level child up to parent
    pids=`pstree -pa ${cspid}|grep -v '{V8 WorkerThread}'|sed -e 's/.*,//' -e 's/ .*//'|tac`
    # echo "pids under ${cspid}: ${pids}"
    # SIGHUP is enough
    kill -1 $pids
  done
}

after_count=`my_pid_count`
after_mem=`my_mem`
echo "process count ${before_count} -> ${after_count}"
echo "memory use ${before_mem} -> ${after_mem}"
