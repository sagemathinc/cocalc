#!/bin/bash
# Check which keys are not used: i.e. which are in the translated files, but not in the extracted strings.

# Extract keys from the first JSON file and sort them
keys1=$(jq -r 'keys_unsorted[]' i18n/extracted.json | sort)

# Extract keys from the second JSON file and sort them
keys2=$(jq -r 'keys_unsorted[]' i18n/trans/de_DE.json | sort)

# Compare the sorted keys and find those present in the second file but not in the first
unused=$(comm -13 <(echo "$keys1") <(echo "$keys2"))

if [ -z "$1" ]; then
    if [ -z "$unused" ]; then
        echo "No unused keys"
        exit 0
    else
        echo "Unused keys"
        echo "$unused"
        echo ""
        echo "append arg 'delete' to acutally delete these keys."
        exit 1
    fi
fi

if [ "$1" == "delete" ]; then
    # if $SIMPLELOCALIZE_KEY is not set, throw an error
    if [ -z "${SIMPLELOCALIZE_KEY}" ]; then
        echo "Error: SIMPLELOCALIZE_KEY is not set or is empty. Please provide a valid API key." >&2
        exit 1
    fi

    echo "Deleting unused keys from SimpleLocalize..."
    for key in $(comm -13 <(echo "$keys1") <(echo "$keys2")); do
        echo
        echo "Deleting '$key':"
        curl \
            --location \
            --request DELETE "https://api.simplelocalize.io/api/v1/translation-keys?key=$key" \
            --header "X-SimpleLocalize-Token: $SIMPLELOCALIZE_KEY"
    done
    echo
    echo
    echo "Now you have to download  and compile again..."
fi
