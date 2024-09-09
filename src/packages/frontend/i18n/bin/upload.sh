#!/usr/bin/env bash

simplelocalize upload --apiKey $SIMPLELOCALIZE_KEY --languageKey en --uploadFormat simplelocalize-json --overwrite --uploadPath ./i18n/extracted.json
