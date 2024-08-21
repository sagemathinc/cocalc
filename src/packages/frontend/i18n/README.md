# I18N in CoCalc

## Development

Define messages directly in the component or use `./common.ts` for shared messages, etc. Search for e.g. `labels.projects` to see how they are used. This is only for the frontend – the Next.js part could be done similarly, but needs a separate workflow.

`frontend/package.json` has three script entries, which are for [SimpleLocalize](https://simplelocalize.io/).

Note: the provider could be changed at any time – what's important is to end up with matching "compiled" files for each language, where "compiled" means we need those `single-language-json` formatted files for `formatjs`. In the end, just look at the language files: they are pretty simple and unique IDs for each message just need an entry in each language. Otherwise the `defaultMessage` is shown and an error is thrown.

After introducing new messages:

1.  `pnpm i18n:extract`:

    This command requires to use git to pass in the tsx files `$(git ls-files '**/*.tsx')`. Otherwise, even though there are excludes, it just runs forever or until it runs out of memory. The resulting extracted strings are in the `i18n/extracted.json` file. That's the one that will be uploaded...

1.  `export SIMPLELOCALIZE_KEY=...` (key comes from simpelocalize)
1.  `pnpm i18n:upload`:

    Basically, the `i18n/extracted.json` will be sent to SimpleLocalize.

1.  Open/refresh SimpleLocalize

    It will show the additional entries – translate them – save the changes – review if necessary. You can use the sort mechanism to list the ones without a translation at the top. Existing translations with the same ID will not be touched. The English translation might be out of sync with the `defaultMessage`, and you can ignore it – we use the `defaultMessage` for English.

1.  `pnpm i18n:download`

    Will grab the updated files like `zh_CN.json` and save them in the `i18n` folder.

1.  Reload the `frontend` after a compile, such that `await import...` will load the updated translation file for the set locale.

Note: if just a translation has been updated, you only need to do the `i18n:download` step.

Ref:

- https://formatjs.io/docs/react-intl/components
- https://formatjs.io/docs/react-intl/api
- https://simplelocalize.io/docs/integrations/format-js/
- https://simplelocalize.io/docs/integrations/format-js-cli/

### Issues

In dev mode, there are warnings like `"defaultRichTextElements" was specified but "message" was not pre-compiled.`. I don't understand why. These simple json messages for translations are fine (at least there is no way to compile them) and they also seem to work. It's probably a matter of fixing the top level "render.tsx" components – i.e. when to prevent a rendering, because of incomplete data, or something like that.

## Specifics

CoCalc specific rules for implementing translations, of which I think are good to follow in CoCalc's environment:

- **Explicit ID**: Technically, the ID is optional. Then it is computed as a hash upon extraction. However, this has two negative sides:
  - If the message changes, it's hash changes, and you have to start over with the translation. This is good from an idealistic standpoint, but if you just tweak a word or correct a typo, the existing translations are still ok. If the meaning changes completely, it's better to create a new ID. (Of course, changes to the `defaultMessage` need to go through the `extract → upload` step, except that the English translation uses the `defaultMessage` directly.)
  - Sorting: All the translations and also online tools like SimpleLocalize sort the translations by their keys. Look at the translated `i18n/de_DE.json` and you'll see that messages that are related are also next to each other. This also makes it possible to filter for a specific
- Pitfall **No variables in properties**: I think the extraction process does not know how to deal with variables, when extracting strings from properties. So, either define the message objects elsewhere (like it is done with `labels`) or write a multiline string in place. See the examples below for what works.
- **No `en` translation**: English is the default. The `defaultMessage` is already in the code. We do not download the supposedly translated `en` file and just let the fallback mechanism kick in. This also means that changes to the `defaultMessage` will show up with the next build, even without touching any of the translations.
- **richTextElements**: in `app/localize.tsx`, a few default `richTextElements` are defined – just for convenience. Anchor tags must be defined individually, because link text and href can't be wrapped that way.
- **Query parameter**: A new `?lang=en` (or `=de`, `=zh`, ...) query parameters lets you change the language as well. This also changes the account setting. Hence, a URL with `?lang=en` can be used to reset the account setting to English.

## Style

We discussed this internally on 2024-08-19 and came to the conclusion that we should not overdo translations.

- Example: translating the "Run" button in Jupyter to German or Russian, which both have more or less the meaning of "running in the street", is extremely awkward. It's also a well recognizable element, which users are used to, even without knowing what it really means. Same holds for "Kernel", which is even in English a pretty weird choice. Therefore, we do not translate elements like the "Run" button or "Kernel" for Jupyter Kernels. A "Run" menu however, in general, could be translated (e.g. in German it is called "Ausführen").
- However, what we should translate (or add) are hover text explanations. So, in the case of the "Run" button, there should be a tooltip, which explains in the current language, what this button really does.

## Examples

Here are examples of how to use this:

### Sign out confirmation

Below, there are 3 usages of different types of translations. Below are their explanations.

```tsx
<Popconfirm
  title={
    <div style={{ maxWidth: "60ex" }}>
      <FormattedMessage
        id="account.sign-out.button.title"
        description="Sign out/Sign out everyhwere button in account settings"
        defaultMessage={`Are you sure you want to sign {account} out
{everywhere, select,
true {on all web browsers? Every web browser will have to reauthenticate before using this account again.}
other {on this web browser?}
}
{is_anonymous, select,
true {Everything you have done using this TEMPORARY ACCOUNT will be immediately deleted!  If you would like to save your work to a new account, click cancel and sign up below.}
other {}
}`}
        values={{
          account,
          everywhere,
          is_anonymous: store.get("is_anonymous"),
        }}
      />
    </div>
  }
  onConfirm={sign_out}
  okText={intl.formatMessage(
    {
      id: "account.sign-out.button.ok",
      defaultMessage: `Yes, sign out{everywhere, select, true { everywhere} other {}}`,
    },
    { everywhere },
  )}
  cancelText={intl.formatMessage(labels.button_cancel)}
>
  [...]
</Popconfirm>
```

- `<FormattedMessage />` in this version of `formatjs` returns a `React.Fragment`. This means you can either use it directly inside a `<Paragraph><...></Paragaraph>` or pass into a component. The component should be able to handle children of that kind. The most simplistic way of using this is to put `<span>` tags around it.
  - The `defaultMessage` is what will be extracted. It contains conditional messages, which follow the ICU standard. (Those `{var_name, select, case1 {string} case2 {string} other {string}}` constructs, where the `other` clause is mandatory).
  - The easiest use are just `{variable_name}`, where the variable is defined in the `values=...` property. This could also be a react component! E.g. `{br}` combined with `values={{br: <br/>}}` can be used to insert a line break or use `<p>...</p>` combined with `values={{p: (ch) => <Paragraph>{ch}</Paragraph>}}` to map the `<p>` XML tags to a paragraph with a child text. Some tags are defined as defaults, though.
  - Ref: ICU Messages: https://unicode-org.github.io/icu/userguide/format_parse/messages/
- **okText**: That's a simple string, where the English variant is defined right here. Note, that the ID of the OK text and the title are very similar.
- **cancelText**: That references a common message, which is used in many places. It's the "Cancel" text on the button. The `labels` object comes from `import { labels } from "@cocalc/frontend/i18n"`.

## Menu entries

They are a bit tricky, because upon loading the module, they're constructed via several functions.
However, all it needs is to define the object for the formatted message for the `label` or `title`. E.g. here is the button to "force rebuild" a document:

```typescript
force_build: {
  group: "build",
  label: defineMessage({
    id: "command.generic.force_build.label",
    defaultMessage: "Force Build",
  }),
  title: defineMessage({
    id: "command.generic.force_build.title",
    defaultMessage: "Force rebuild entire project.",
  }),
}
```

The `ManageCommands` class knows what to do with that. If you use a function to define a label or title,
the `intl` (`IntlShape`) object is passed in as well.

```typescript
build_on_save: {
  group: "build",
  label: ({ intl }) => intl.formatMessage({ id: "...",  defaultMessage: "..."}, { ...values })
}
```
