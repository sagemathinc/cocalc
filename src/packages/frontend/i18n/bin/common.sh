LANGS="de_DE zh_CN es_ES es_PV fr_FR nl_NL ru_RU it_IT ja_JP pt_PT pt_BR ko_KR pl_PL tr_TR he_IL hi_IN hu_HU ar_EG"

check_api_key() {
    if [ -z "${SIMPLELOCALIZE_KEY}" ]; then
        echo "Error: SIMPLELOCALIZE_KEY is not set or is empty. Please provide a valid API key." >&2
        exit 1
    fi
}
