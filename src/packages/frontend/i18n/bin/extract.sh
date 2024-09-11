#!/usr/bin/env bash

# The interpolation pattern is a fixed string, because we intentionally trigger ID colissions.
# There is just one (unused) string without a unique ID – otherwise we always set an explicit hierarchical ID.
# Read the README in this directory for more information.
pnpm exec formatjs extract $(git ls-files '**/*.tsx') i18n/*.ts jupyter/commands.ts \
	--ignore='**/*.d.ts' --ignore='node_modules/*' \
	--ignore='dist/*' \
	--out-file i18n/extracted.json \
	--throws \
	--id-interpolation-pattern 'UNIQUE_ID_IS_MISSING'
