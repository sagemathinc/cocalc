# Webapp CDN files

These packages

- katex
- codemirror

## Why?

This directory contains additional resources for at least the `/index.html` and `/app` page. Many of these were served directly from CDN's before. However, that introduces a dependency where [CoCalc.com](http://CoCalc.com) can't load unless all these random CDN's also work... and that is unacceptable for two reasons:

1. If any of these CDN's go down, [CoCalc.com](http://CoCalc.com) would get mangled or not load. That's no good.
2. If you use a private install of cocalc on a computer that doesn't have network access, it doesn't work at all ever. That's definitely not good.

## IMPORTANT: How do I update a package version?

Obviously, you can't use `pnpm update package` because of the package\-lock.json!!

Instead:

1. copy `package.json` and `package-lock.json` into a tmp directory, use normal npm commands to update your package, then copy them back. Do this as well to ensure that we use the specific lockfile version assumed by the setup.py script.

```
npm install --lockfile-version 2 ...
```

2. Make sure to still run `pnpm install` after doing this, so that the top-level pnpm lock file is properly updated. We want our version-check script, etc., to still scan package.json.

Sorry, yes that is very ugly, but _**until the script**_ _**`setup.py`**_ _**gets rewritten to work with pnpm**_, that is what we have to do. It's not obvious how to rewrite `setup.py`, since the whole approach makes assumptions that aren't satisfied by pnpm.

## How to build?

The build of this depends on npm, but we switched to pnpm. So that's confusing.
So we do some hacks that accomplish the following when running `pnpm build`.
In particular, do NOT delete package-lock.json, which this depends on.

You just run `pnpm run build` to build this as for everything else. Under the hood, that actually runs normal `npm` in a subdirectory, then copies out the build artificats.

The `setup.py` script \(that `npm run build` uses\) makes sure to include a version number in the path, because all files will be served with a long cache time.

## Notes

Other files in `packages/assets` might not be used any more. At some point we can clean them up.

We have to run a postinstall script to create the versioned symlinks, since -- to be cross platform -- npm itself [doesn't support symlinks](https://npm.community/t/how-can-i-publish-symlink/5599).

