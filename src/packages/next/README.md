# The Next.js Server

## Upgrades

**IMPORTANT:** When upgrading the `next` package, always do this:

```sh
npm install -E next@latest  # note the -E!
```

This ensures that the version of next on the build machine when making the npm package is the same as the version on the server when you deploy it! I've been bitten by messing this up _multiple times._ The problem is:

1. Upgrade next, e.g., to version 12.1.5, say, so it says `^12.1.5` in package.json
2. Build and deploy npm module using next 12.1.5.
3. Install it on the server a day later... and it goes BOOM and totally break!
4. Why?  Because the server has next 12.1.6 installed, due to semver.  However, and this is important, **nextjs's** build has absolutely no respect for semver.

## Overview

This is a next.js app, which is used as part of CoCalc to provide the landing page and the share server.

To develop this, mostly just edit code here and it will automatically reload (hot module reloading) without you having to refresh the page.  As long as you're not changing basic configuration, you don't have to restart the server.

You don't **need** to start your own nextjs server here -- the hub handles that.  That said, you can, especially for debugging purposes -- see `package.json` .

## The Landing Page

The landing page is `pages/index.tsx`.

## The Share Server

The paths for the share server are in `pages/share`.  Also see `lib/share` and `components/share` for code specific to the share server.

