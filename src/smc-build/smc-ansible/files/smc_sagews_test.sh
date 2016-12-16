#!/usr/bin/env bash
# this is a test-runner for the smc_sagews test suite
# it simulates a project environment inside the "monitoring" user account
cd
export SMC=$HOME/.smc
export USER=monitoring
source /etc/bash.bashrc
source /etc/bash-smc.bashrc
path-append /usr/local/bin
rm -rf smc
git clone --depth=1 https://github.com/sagemathinc/smc smc
smc-local-hub start
smc-sage-server start
cd smc/src/smc_sagews/smc_sagews
python -m pytest ./
smc-sage-server stop
smc-local-hub stop
sleep 10

function cleanup {
# cleanup still running processes of user "monitoring" (but not all of them are bad ones)
cat << EOF | python3
print("cleanup -- started")
import psutil as ps
myself = ps.Process()
for p in ps.process_iter():
    if p.username() != 'monitoring': continue
    cmd = p.cmdline()
    l = len(cmd)
    if l >= 1 and 'node_exporter' in cmd[0]: continue
    if l >= 2 and 'prometheus'    in cmd[1]: continue
    if p == myself or p == myself.parent():  continue
    print('killing %s' % ' '.join(p.cmdline()))
    p.kill()
print("cleanup -- finished")
EOF
}

trap cleanup EXIT


