# An install script for those who want to develop for SMC on SMC
git clone https://github.com/sagemathinc/smc
cd smc/src
./smc-env
npm run make
cd dev/project/
./tmux-start-all
