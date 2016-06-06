#!/usr/bin/env bash
set -e

export API_KEY=$HOME/secrets/cloudflare/cloudflare

if [ ! -f $API_KEY ]; then
  echo "$0: You must put the CloudFlare API key in '$API_KEY'."
  exit 1
else
  echo "$0: Contacting CloudFlare servers to clear cache."
  curl https://www.cloudflare.com/api_json.html \
  -d 'a=fpurge_ts' \
  -d "tkn=`cat $API_KEY`" \
  -d 'email=office@sagemath.com' \
  -d 'z=sagemath.com' \
  -d 'v=1'
  echo "Success!"
fi