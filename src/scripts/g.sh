set -ev
mkdir -p `pwd`/logs
export LOGS=`pwd`/logs
rm -f $LOGS/log
unset INIT_CWD
unset PGHOST
export DEBUG="cocalc:*"
#export DEBUG_CONSOLE="yes"
unset DEBUG_CONSOLE

# Set this COCALC_DISABLE_NEXT to something nonempty to disable nextjs entirely
# which is very helpful when doing development.
# export COCALC_DISABLE_NEXT="yes"

#export COCALC_DISABLE_API_VALIDATION=yes
#export NO_RSPACK_DEV_SERVER=yes

while true; do
  if [ x"$COCALC_PROD_MODE" = "x" ]; then
      pnpm hub
  else
      pnpm hub-prod
  fi
  sleep 1
done
