#!/usr/bin/env bash

. ./i18n/bin/common.sh
check_api_key

# The English language is always used directly from the default strings.
# During upload, any changes are overwritten as well.
simplelocalize upload \
    --apiKey $SIMPLELOCALIZE_KEY \
    --languageKey en \
    --uploadFormat simplelocalize-json \
    --overwrite \
    --uploadPath ./i18n/extracted.json
