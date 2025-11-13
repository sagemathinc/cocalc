LANGS="en es de zh ru fr it nl ja hi pt ko pl tr he hu ar br eu"

check_api_key() {
    if [ -z "${SIMPLELOCALIZE_KEY_NEXT}" ]; then
        echo "Error: SIMPLELOCALIZE_KEY_NEXT is not set or is empty. Please provide a valid API key for the CoCalc Pages project." >&2
        exit 1
    fi
}
