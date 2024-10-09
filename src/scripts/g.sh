set -ev
mkdir -p `pwd`/logs
export LOGS=`pwd`/logs
rm -f $LOGS/log
unset INIT_CWD
unset PGHOST
export DEBUG="cocalc:*"
#export DEBUG_CONSOLE="yes"
unset DEBUG_CONSOLE

#export COCALC_DISABLE_API_VALIDATION=yes
#ulimit -Sv 120000000

while true; do
  pnpm hub
  sleep 1
done
