# Webapp CDN files

## Why?

This directory contains additional resources for at least the `/index.html` and `/app` page. Many of these were served directly from CDN's before. However, that introduces a dependency where [CoCalc.com](http://CoCalc.com) can't load unless all these random CDN's also work... and that is unacceptable for two reasons:

1. If any of these CDN's go down, [CoCalc.com](http://CoCalc.com) would get mangled or not load. That's no good.
2. If you use a private install of cocalc on a computer that doesn't have network access, it doesn't work at all ever. That's definitely not good.

## How?

The build of this depends on npm, but we switched to pnpm. So that's confusing.
So we do some hacks that accomplish the following when running `pnpm build`.
In particular, do NOT delete package-lock.json, which this depends on.

Run `npm ci` to install the modules in the node_modules directory, as usual. The run `npm run build` to update the `dist/` subdirectory with all relevant data ready to be served via various webservers. The `setup.py` script (that `npm run build` uses) makes sure to include a version number in the path, because all files will be served with a long cache time.

## Notes

Other files in `packages/assets` might not be used any more. At some point we can clean them up.

We have to run a postinstall script to create the versioned symlinks, since -- to be cross platform -- npm itself [doesn't support symlinks](https://npm.community/t/how-can-i-publish-symlink/5599).

