# i18n in CoCalc

Define messages directly in the component or use `./common.ts` for shared messages, etc. Search for e.g. `labels.projects` to see how they are used. This is only for the frontend – the Next.js part could be done similar, but needs a separate workflow.

`frontend/package.json` has three script entries, which are for [SimpleLocalize](https://simplelocalize.io/).

Note: the provider could be changed at any time – what's important is to end up with matching "compiled" files for each language, where "compiled" means we need those `single-language-json` formatted files for `formatjs`. In the end, just look at the language files: they are pretty simple and unique IDs for each message just need an entry in each language. Otherwise the `defaultMessage` is shown and an error is thrown.

After introducing new messages:

1.  `pnpm i18n:extract`
1.  `export SIMPLELOCALIZE_KEY=...` (key comes from simpelocalize)
1.  `pnpm i18n:upload`
1.  After opening/refreshing simplelocalize, it will show the additional entries – translate them – save the changes – review if necessary
1.  `pnpm i18n:download` will grab the updated files like `zh_CN.json`
1.  Reload the `frontend` after a compile, such that `await import...` will load the updated translation file for the set locale.

Note: if just a translation has been updated, you only need to do the `i18n:download` step.

Ref:

- https://formatjs.io/docs/react-intl/components
- https://formatjs.io/docs/react-intl/api
- https://simplelocalize.io/docs/integrations/format-js/
- https://simplelocalize.io/docs/integrations/format-js-cli/
