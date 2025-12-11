#!/bin/bash
# Delete specific translation keys from SimpleLocalize
# Usage: ./delete.sh key1 [key2 key3 ...]

if [ $# -eq 0 ]; then
    echo "Usage: $0 key1 [key2 key3 ...]"
    echo "Delete one or more translation keys from SimpleLocalize"
    echo ""
    echo "Example:"
    echo "  $0 labels.account"
    echo "  $0 labels.account account.sign-out.button.title"
    exit 1
fi

# Check if SIMPLELOCALIZE_KEY is set
if [ -z "${SIMPLELOCALIZE_KEY}" ]; then
    echo "Error: SIMPLELOCALIZE_KEY is not set or is empty. Please provide a valid API key." >&2
    exit 1
fi

echo "Deleting translation keys from SimpleLocalize..."

# Loop through all provided keys
for key in "$@"; do
    curl \
        -s \
        --location \
        --request DELETE "https://api.simplelocalize.io/api/v1/translation-keys?key=$key" \
        --header "X-SimpleLocalize-Token: $SIMPLELOCALIZE_KEY"
done

echo
echo
echo "Done! Now you should run:"
echo "  pnpm i18n:upload    (to re-upload the key with new content)"
echo "  pnpm i18n:download  (to fetch updated translations)"
echo "  pnpm i18n:compile   (to compile translation files)"
