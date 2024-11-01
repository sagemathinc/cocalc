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

# trigger automatic translations for all new messages
echo "Started automatic translation for that many languages:"
curl -s -X 'POST' 'https://api.simplelocalize.io/api/v2/jobs/auto-translate' \
    -H 'accept: application/json' \
    -H "X-SimpleLocalize-Token: $SIMPLELOCALIZE_KEY" \
    -H 'Content-Type: application/json' \
    -d '{"options": []}' | jq '.data|length'
