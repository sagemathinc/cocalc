#!/usr/bin/env bash
. ./i18n/bin/common.sh
for L in $LANGS; do
  pnpm exec formatjs compile --ast --format i18n/formatter.js --out-file ./i18n/$L.compiled.json  ./i18n/$L.json
  #rm ./i18n/$L.json # we might want to delete it at some point, but for now it is nice to have a copy of the translated messages
done
