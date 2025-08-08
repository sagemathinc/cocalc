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

echo "Waiting for auto-translation jobs to complete..."

# Wait for all auto-translation jobs to complete
while true; do
    sleep 3

    # Get all active jobs
    jobs_response=$(curl -s -X 'GET' 'https://api.simplelocalize.io/api/v1/jobs' \
        -H 'accept: application/json' \
        -H "X-SimpleLocalize-Token: $SIMPLELOCALIZE_KEY")

    # Count jobs that are not yet completed (state != "SUCCESS")
    total_jobs=$(echo "$jobs_response" | jq '.data | length')
    success_jobs=$(echo "$jobs_response" | jq '[.data[] | select(.state == "SUCCESS")] | length')
    active_jobs=$((total_jobs - success_jobs))

    if [ "$active_jobs" -eq 0 ]; then
        echo "✓ All auto-translation jobs completed!"
        break
    else
        echo "  $active_jobs job(s) still running..."
    fi
done
