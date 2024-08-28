#!/usr/bin/env bash
. ./i18n/bin/common.sh
for L in $LANGS; do
  simplelocalize download --apiKey $SIMPLELOCALIZE_KEY --downloadPath ./i18n/$L.json --downloadFormat single-language-json --languageKey=$L
done
