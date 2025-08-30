LANGS="de_DE zh_CN es_ES es_PV fr_FR nl_NL ru_RU it_IT ja_JP pt_PT pt_BR ko_KR pl_PL tr_TR he_IL hi_IN hu_HU ar_EG"

check_api_key() {
    if [ -z "${SIMPLELOCALIZE_KEY}" ]; then
        echo "Error: SIMPLELOCALIZE_KEY is not set or is empty. Please provide a valid API key." >&2
        exit 1
    fi
}

# Execute a function for each language, optionally in parallel
# Usage: run_for_each_lang <function_name>
run_for_each_lang() {
    local func_name="$1"

    if [ -z "$func_name" ]; then
        echo "Error: function name is required" >&2
        exit 1
    fi

    start_time=$(date +%s)

    if command -v parallel &>/dev/null; then
        echo "The 'parallel' command is installed. Running $func_name in parallel."
        export -f "$func_name"
        echo "$LANGS" | tr ' ' '\n' | parallel -j8 --delay 0.1 --will-cite "$func_name"
    else
        echo "The 'parallel' command is not installed (install it with 'sudo apt-get install parallel'). Running $func_name sequentially."
        for L in $LANGS; do
            "$func_name" "$L"
        done
    fi

    end_time=$(date +%s)
    execution_time=$((end_time - start_time))
    echo "$func_name completed in ${execution_time} seconds."
}
