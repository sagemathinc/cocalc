This is a more crude i18n functionality than what we have in the frontend.
To work on that, look at the `lang/[locale]/index.tsx` file.
It uses the `useTranslation` hook with the "index" namespace – as of writing this, we only have one namespace.

To add messages, open the `locales/en/index.json` file and add more key/values.

Then, reference the key using the `t('key')` function in your component.
To make formatted text work, use the `<Trans ...>` component, and prefix `index:` to the key for its namespcae.

Then, call the `pnpm i18n:upload` command, trigger the translations in simplelocalize, and once done, call `pnpm i18n:download`.

If strings need to be modified, delete them online to translate them fresh or call them differently.
