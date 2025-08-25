#!/usr/bin/env bash
. ./i18n/bin/common.sh

check_api_key

# Each language is downloaded into a separate file and compiled – this allows for dynamic imports.
download() {
  local lang="$1"
  echo "calling download '$lang'"
  simplelocalize download \
    --apiKey "$SIMPLELOCALIZE_KEY" \
    --downloadPath "./i18n/trans/${lang}.json" \
    --downloadFormat single-language-json \
    --languageKey="$lang"
}

run_for_each_lang download
