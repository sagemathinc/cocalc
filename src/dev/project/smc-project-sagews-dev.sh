#!/bin/bash

# script "smc-project-sagews-dev"
# use when ready to start new branch of development for SMC sagews
# requirements:
#   git upstream remote repo is sagemathinc.smc, used read-only
#   git origin remote repo is developer's fork of smc in developer's github
#   local smc git repo at ~/smc
#   be ready with new branch name, for example "isssue456utf"
#
# usage:
#   new-issue [new-branch-name]
# script will ask for new-branch-name if not provided on command line

trap "echo '**script error exit**';exit" ERR

echo "NOTE: restart your SMC dev project before running this script"

if [[ $# -ge 1 ]];then
  BNAME=$1
else
  echo -n "name of new SMC branch (issueXXXdescword): "
  read BNAME
fi
echo -n "ok to start smc dev on new branch $BNAME? (y|n) "
read ans
case $ans in
y|Y)
  ;;
*)
  echo canceled
  ;;
esac

cd ~/smc
# echo "checking that 'upstream' remote is main SMC github repo"
git config remote.upstream.url | grep -q sagemathinc/smc.git || {
  echo "git remote upstream must point to sagemathinc/smc.git"
  exit 1
}

# echo "checking that 'origin' remote is non-upstream SMC github repo"
git remote show origin|grep "Push.*smc.git"|grep -vq sagemathinc || {
  echo "git remote origin must point to non-sagemathinc smc github repo"
  exit 1
}

if [[ $EUID -eq 0 ]]; then
   echo "This script must NOT be run as root"
   exit 1
fi


echo "killing old sage worksheet processes"
pkill -f sage_server_command_line || test $? -eq 1
rm -f ~/.smc/sage_server/sage_server.pid

echo "updating git"
git checkout master
git pull upstream master
git checkout -b $BNAME

echo "updating smc_sagews and tests"
cd ~/smc/src/smc_sagews
pip install --user --upgrade ./

echo "running tests"
cd ~/smc/src/smc_sagews/smc_sagews/tests

# baseline run of all tests before we start making changes
python -m pytest

echo "setup for branch $BNAME done"
