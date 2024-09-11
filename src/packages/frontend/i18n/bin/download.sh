#!/usr/bin/env bash
. ./i18n/bin/common.sh

check_api_key

# Each language is downloaded into a spearate file and compiled – this allows for dynamic imports.
for L in $LANGS; do
  simplelocalize download \
    --apiKey $SIMPLELOCALIZE_KEY \
    --downloadPath ./i18n/trans/$L.json \
    --downloadFormat single-language-json \
    --languageKey=$L
done
