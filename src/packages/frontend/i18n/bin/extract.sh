#!/usr/bin/env bash

# The interpolation pattern is a fixed string, because we intentionally trigger ID colissions.
# There is just one (unused) string without a unique ID – otherwise we always set an explicit hierarchical ID.
# Read the README in this directory for more information.
TS=$(git grep -l "defaultMessage" -- '*.ts')
TSX=$(git grep -l "defaultMessage" -- '*.tsx')
pnpm exec formatjs extract $TS $TSX i18n/*.ts ../util/compute-states.ts ../util/i18n/*.ts \
	--ignore='**/*.d.ts' --ignore='node_modules/*' \
	--ignore='dist/*' \
	--out-file i18n/extracted.json \
	--throws \
	--id-interpolation-pattern 'UNIQUE_ID_IS_MISSING'
