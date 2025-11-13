# Update i18n Translations

Complete workflow for updating internationalization translations in CoCalc frontend.

## What this command does

This command runs the full i18n update sequence:
1. **Extract** new translation strings from source code
2. **Upload** them to SimpleLocalize for automatic translation to 19+ languages  
3. **Download** the translated files
4. **Compile** them for runtime use

## Usage

```
/update-i18n
```

## Commands executed

Run this in `./packages/frontend/`

Step 1:

Wait for the auto-translations to finish

```bash
pnpm i18n:extract && pnpm i18n:upload
```

Step 2:


```
pnpm i18n:download && pnpm i18n:compile
```

## When to use

- After adding new FormattedMessage components with translation IDs
- After modifying existing translation strings
- When preparing translations for a new feature release
- When onboarding new languages

## Prerequisites

- Must be in the `packages/frontend` directory
- SIMPLELOCALIZE_KEY environment variable must be set
- Changes to translation strings should already be committed to source code
