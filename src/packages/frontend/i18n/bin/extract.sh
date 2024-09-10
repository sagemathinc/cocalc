#!/usr/bin/env bash

pnpm exec formatjs extract $(git ls-files '**/*.tsx') i18n/*.ts jupyter/commands.ts  \
                   --ignore='**/*.d.ts' --ignore='node_modules/*' \
		   --ignore='dist/*' \
		   --out-file i18n/extracted.json \
		   --throws \
		   --id-interpolation-pattern 'UNIQUE_ID_IS_MISSING'
