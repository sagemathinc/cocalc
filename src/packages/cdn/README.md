# Webapp Resource files

## Why?

This directory contains additional resources for at least the `/index.html`   and `/app`   page.  Many of these were served directly from CDN's before. However, that introduces a dependency where [CoCalc.com](http://CoCalc.com) can't load unless all these random CDN's also work... and that is unacceptable for two reasons:

1. If any of these CDN's go down, [CoCalc.com](http://CoCalc.com) would get mangled or not load.  That's no good.
2. If you use a private install of cocalc on a computer that doesn't have network access, it doesn't work at all ever.  That's definitely not good.

## How?

Run `npm ci` to install the modules in the node\_modules directory, as usual.  The run `npm run build` to update the `dist/` subdirectory with all relevant data ready to be served via various webservers.  The `setup.py` script (that `npm run build` uses)  makes sure to include a version number in the path, because all files will be served with a long cache time.

**IMPORTANT:** we copy all the files from `node_modules`  to dist, rather than just making symlinks, because (1) the symlinks don't get published to npm anyways, and (2) the `node_modules`  folders would likely get hoisted away when we install elsewhere, thus breaking everything.

## Notes

Other files in `webapp-lib` might not be used any more. At some point we can clean them up.

We have to run a postinstall script to create the versioned symlinks, since -- to be cross platform -- npm itself [doesn't support symlinks](https://npm.community/t/how-can-i-publish-symlink/5599).
