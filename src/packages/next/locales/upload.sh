#!/usr/bin/env bash

. ./locales/common.sh
check_api_key

# The English language is always used directly from the default strings.
# During upload, any changes are overwritten as well.
simplelocalize upload \
    --apiKey $SIMPLELOCALIZE_KEY_NEXT \
    --languageKey en \
    --uploadFormat single-language-json \
    --overwrite \
    --uploadPath "./locales/en/{ns}.json"

