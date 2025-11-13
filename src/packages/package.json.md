# Notes about package.js

## Overrides

Since we have workspaces, they must be in the root `package.json`

- `@mistralai/mistralai`
  - Overrides the global `fetch` command and we fix this essentially by merging in https://github.com/mistralai/client-js/pull/42
  - Remove the override and delete our fork once https://github.com/mistralai/client-js/issues/44 is fixed
  - The extra `node_modules/*` prefix is because otherwise the symlink pointed to the wrong dir level. Must be a bug in pnpm!
- `@langchain/core`
  - Pinning its version is strongly recommended: https://js.langchain.com/docs/get_started/installation#installing-integration-packages
