#!/usr/bin/env bash
. ./i18n/bin/common.sh

# It was necessary to write a custom formatter (see formatter.js) – not clear why, but it works. It's just a trivial mapping.
# "--ast" this is the main point of compiling: we use ICU messages, which no longer need to be parsed each time.
# This compile step is called by the `pnpm build` step as well, hence there is no need to keep the compiled files in the sources.
for L in $LANGS; do
  pnpm exec formatjs compile \
    --ast \
    --format i18n/formatter.js \
    --out-file ./i18n/trans/$L.compiled.json \
    ./i18n/trans/$L.json
done
