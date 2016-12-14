#!/usr/bin/env bash
# this is a test-runner for the smc_sagews test suite
# it simulates a project environment inside the "monitoring" user account
cd
export SMC=$HOME/.smc
. /etc/bash-smc.bashrc
rm -rf smc
git clone --depth=1 https://github.com/sagemathinc/smc smc
smc-local-hub start
smc-sage-server start
cd smc/src/smc_sagews/smc_sagews
python -m pytest ./
smc-sage-server stop
smc-local-hub stop
# TODO cleanup still running processes of user "monitoring" (but not all of them are bad ones)
