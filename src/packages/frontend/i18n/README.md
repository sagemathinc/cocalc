# I18N in CoCalc

## Development

Right now, all of this is only for the frontend – the Next.js part could be done similarly, but needs a separate workflow. In particular, on those "next" landing pages there would be additional sections for different languages – here, we translate specific strings in-place.

To get started, you either define messages directly in a `tsx` file in the component or use `./common.ts` for messages that are used in multiple places across the application. Search for e.g. `labels.projects` to see how such defined messages are used. It is generally discouraged to re-use messages, because context usually matters – the exception are short labels and single words, which should actually be consistent across their usage. Use `./common.ts` only for messages that need to be shared; component-specific messages should be defined locally in the component file where they are used.

To get a feeling how this works, search in the source code for existing usages. At the end of this file are detailed examples.

- The `<FormattedMessage id="[directory].[subdir].[filename].[aspect].[label|title|...]"                defaultMessage="..." />` is only used in `*.tsx` files. They return a `Fragment` and you can also specify values. Read up on its documentation to learn more. On top of that, read up on `Explicit ID` noted below.
- A `defineMessage({ id: "[...].[...].[label|title|tooltip|...]",  defaultMessage:"..."})` is used when you define a message in a data structure, which will be referenced by a component. That "defined message" is basically a tagged object. You cannot use it directly in a component!
  - To make use of such a `defineMessage`, you have to get a hold of `const intl = useIntl()` and then `intl.formatMessage(the_message_object)`. That will render a string.
- Note: There is a type `IntlMessage` defiend by us here in `./types.ts`. It requires `id` and `defaultMessage`. Search for `isIntlMessage` in the code base to see, how it is used to check what to do with it.
- Outside the react context, you use `i18n/index::getIntl`.

Note: The "extract" step parses the source-code of all `*.tsx` files and only a few selected `*.ts` files. You cannot use variables where messages are defined, because the extract tool does not know what to do with them. So, for example, the files that define commands are `*.ts` files, and the messages it uses are referencing the exported messages defined in `i18n/common.ts`. Scanning all files just takes too long.

Note: the provider could be changed at any time – what's important is to end up with matching "compiled" files for each language, where "compiled" means we need those `single-language-json` formatted files for `formatjs`. In the end, just look at the language files: they are pretty simple and unique IDs for each message just need an entry in each language. Otherwise the `defaultMessage` is shown and an error is thrown.

## Translation

After introducing new messages, these are the steps to get all translations into CoCalc:

`frontend/package.json` has four script entries, which are for [SimpleLocalize](https://simplelocalize.io/).

1.  `pnpm i18n:extract`:

    This command requires to use git to pass in the tsx files `$(git ls-files '**/*.tsx')`. Otherwise, even though there are excludes, it just runs forever or until it runs out of memory. The resulting extracted strings are in the `i18n/extracted.json` file. That's the one that will be uploaded...

1.  `export SIMPLELOCALIZE_KEY=...` (key comes from simpelocalize)
1.  `pnpm i18n:upload`:

    Basically, the `i18n/extracted.json` will be sent to SimpleLocalize.
    The `--overwrite` switch is set, such that all new `defaultMessage`s will show up in the English language source.
    This also means it makes no sense to touch the English language strings – they must be fixed in the source code in CoCalc's code base.

1.  Open/refresh SimpleLocalize

    It will show the new keys or changed English language sources – translate them – save the changes – review if necessary. You can use the sort mechanism to list the ones without a translation at the top. Existing translations with the same ID will not be touched. The English translation might be out of sync with the `defaultMessage`, and you can ignore it – we use the `defaultMessage` for English.

1.  `pnpm i18n:download`

    Will grab the updated files containing the translated strings (e.g. `zh_CN.json`) and save them in the `./i18n/trans/` folder.
    The source of truth for these files is always the remotely stored data – hence do not ever edit these files directly.

1.  `pnpm i18n:compile`

    This transforms the `[locale].json` translation files from the step before to `[locale].compiled.json`.
    This could also reveal problems, when conditional ICU messages aren't properly formatted.
    E.g. `"Sí, cerrar sesión{en todas partes, seleccionar, verdadero { en todas partes} otro {}}" with ID "account.sign-out.button.ok" in file "./i18n/es_ES.json"`:
    In the brackets, it has to start according to the syntax: `{everywhere, select, true {..} other {}}`, i.e. the variable `everywhere` must stay in English.

1.  Reload the `frontend` after a compile, such that `await import...` will load the updated compiled translation file for the configured locale.

Note: if just a translation has been updated, you only need to do the `i18n:download` & `i18n:compile` steps.

### Unused keys

Development goes on, and it might happen that keys are no longer in use.
That alone does not cause any problems, but it might be nice to just get rid of them.
Run `i18n:unused` to check or optionally delete these keys.

```bash
$ pnpm run i18n:unused [delete]
```

Ref:

- https://formatjs.io/docs/react-intl/components
- https://formatjs.io/docs/react-intl/api
- https://simplelocalize.io/docs/integrations/format-js/
- https://simplelocalize.io/docs/integrations/format-js-cli/

## Specifics

CoCalc specific rules for implementing translations, of which I think are good to follow in CoCalc's environment:

- **Explicit ID**: Technically, the ID is optional. Then it is computed as a hash upon extraction. However, this has two negative sides:
  - If the message changes, it's hash changes, and you have to start over with the translation. This is good from an idealistic standpoint, but if you just tweak a word or correct a typo, the existing translations are still ok. If the meaning changes completely, it's better to create a new ID. (Of course, changes to the `defaultMessage` need to go through the `extract → upload` step, except that the English translation uses the `defaultMessage` directly.)
  - Sorting: All the translations and also online tools like SimpleLocalize sort the translations by their keys. Look at the translated `i18n/de_DE.json` and you'll see that messages that are related are also next to each other. This also makes it possible to filter for a specific
  - Never reference an ID directly – always reference the object of the "defined message", such that label changes (for updating the translation) or typos do not cause problems.
  - Extracting the IDs check for duplicates, so, no worries about that.
- Pitfall **No variables in properties**: I think the extraction process does not know how to deal with variables, when extracting strings from properties. So, either define the message objects elsewhere (like it is done with `labels`) or write a multiline string in place. See the examples below for what works.
- **No `en` translation**: English is the default. The `defaultMessage` is already in the code. We do not download the supposedly translated `en` file and just let the fallback mechanism kick in. This also means that changes to the `defaultMessage` will show up with the next build, even without touching any of the translations.
- **richTextElements**: in `app/localize.tsx`, a few default `richTextElements` are defined – just for convenience. Anchor tags must be defined individually, because link text and href can't be wrapped that way.
- **Query parameter**: A new `?lang=en` (or `=de`, `=zh`, ...) query parameters lets you change the language as well. This also changes the account setting. Hence, a URL with `?lang=en` can be used to reset the account setting to English.
- **Descriptions**: add descriptions, especially for jupyter notebooks or latex, to add more context. The description is not only shown in the translation tool, but also passed on to the language model doing the automatic translations.

## Style

We discussed this internally on 2024-08-19 and came to the conclusion that we should not overdo translations.

- Example: translating the "Run" button in Jupyter to German or Russian, which both have more or less the meaning of "running in the street", is extremely awkward. It's also a well recognizable element, which users are used to, even without knowing what it really means. Same holds for "Kernel", which is even in English a pretty weird choice. Therefore, we do not translate elements like the "Run" button or "Kernel" for Jupyter Kernels. A "Run" menu however, in general, could be translated (e.g. in German it is called "Ausführen").
- However, what we should translate (or add) are hover text explanations. So, in the case of the "Run" button, there should be a tooltip, which explains in the current language, what this button really does.

## SimpleLocalize

### Configuration

This is about auto-translations, in "Settings → Auto-translation":

- To start: when you add a new language, set its full code, e.g. "fr_FR", name "French" and language "French". Translation provider: OpenAI.
- You need the API key, it's in Integrations → REST API. See notes above.
- In the Auto-translate configuration, OpenAI → Configure:

  - API key: a separate one to track usage, it's fine to restrict its capabilities to list and use models.
  - GPT-4o
  - System prompt: here, the key point is to give some context and to instruct it to retain those ICU messages. That's what I came up with after a few tests and iterations:

        Translation of strings in the user-interface of the online platform "CoCalc".

        Stay close to the original meaning of the source text and match the length and style. In particular, short labels of commands must stay short.

        If a label ends with "...", keep those dots in the translation.

        Retain the syntax of ICU formatted messages. They could contain variables like `some text {variable} more text` or conditionals like `{variable, select, option1 {...} other {...}}`.

  - add description as context: Yes. (I assume this uses the "code description")

- Exclusion dialect: ICU messages
- Excluded words or phrases: CoCalc

### Translating

To actually do the translations, the first tab is "Translations" (the second one is to trigger auto-translations for all new keys. E.g. to catch up with new messages, open the "Languages" tab, and at the top of the list of languages, there is "Auto translate all" → click on it, and confirm, then wait a minute or two.).

For the "Translations" tab, you have a few controls what you can do and see in the interface:

- Configure the "Translations" tab (in the row at the top, beneath the tabs) to show English and e.g. German.
- At the top right is "Settings" to either show them as a grid or in rows:
  - At the top, I recommend to click on "Show translations keys" and "Show **code** description column": both give you additional context (IDs are hierarchical keys).
  - You can obviously tweak this as you like :-)
- Then you can go through the translations (e.g. sort by ID, then similar ones are close by … or sort by "newest keys first" to work on the newest stuff).
- Click on "Accept" to signal that the translation is fine.
- You can also click on the little "Fork" icon at the bottom right of a text box, which gives you interesting tools. A text editor for larger text, an AI-Tool, where you can fix the grammar, shrink or expand the text, etc. … or just check the history of that particular string.
- What ends up in CoCalc during the `i18n:download` step is what is saved there for each language in each box. As of writing this, there is no setup for approved translations.

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
  - There is also a tiny component as an example, for how to translate a bit via a component: `i18n/components.tsx` → `<CancelText />`

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

Many of those messages are actually defined in `i18n/common.ts`. There are groups of messages, e.g. `jupyter.commands`. Messages are only extracted from `*.tsx` and some `*.ts` files – check the code of `i18n/bin/extract.sh` to see what's going on. This file is accompanied by `i18n.test.ts`, which checks the prefixes of all IDs!
