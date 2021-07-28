# How to Build and Run CoCalc

Updated: **July 2021**

Requirement: You must be using Node version 14.x (at least).  **This will definitely not work with node.js version 12 or earlier!** In a [CoCalc.com](http://CoCalc.com) project, you can put this in ~/.bashrc do to get a new enough version.

```sh
.  /cocalc/nvm/nvm.sh
```

## Initial Build

```sh
npm run make
```

This will do `npm ci` for all packages, and also build the typescript/coffeescript, and anything else into a dist directory for each module.

You can also delete all the `node_modules` and `dist` directories in all packages

```sh
npm run clean
```

## Starting Webpack

```sh
npm run webpack
```

That will change to the `packages/static` directory where `npm run webpack` is actually run.

## Starting the Development Hub

```sh
npm run hub
```

That will ensure the latest version of the hub Typescript and Coffeescript gets compiled, and start a new hub running in the foreground logging what is happening to the console _**and also logging to files in**_ `data/logs/hub` .  Hit Control+C to terminate this server.

## Starting the PostgreSQL Database

```sh
npm run database
```

## Get the Status of Packages

By "status" we just mean what the git diff is from when the package was last published to npmjs.

```sh
npm run status
```

or to just see status for a specific package or packages

```sh
npm run status --packages=static,smc-webapp
```

This uses git and package.json to show you which files (in the package directory!) have changed since this package was last published to npmjs.  To see the diff:

```sh
npm run diff
```

## Publishing to [NPMJS.com](http://NPMJS.com)

To publish the production version of the static website to npmjs.com, do this:

```sh
npm run publish --packages=static --newversion=minor --tag=latest
```

Where it says `--newversion=`, reasonable options are `"major"`, `"minor"`, and `"patch"`.

**VERY IMPORTANT:** _Do NOT do "`npm publish`" -- the word "run" above is important!!_

## Environment Variables

See `smc-util-node/data.ts` .  In particular, you can set BASE\_PATH, DATA, PGHOST, PGDATA, PROJECTS, SECRETS to override the defaults.  Data is stored in `cocalc/src/data/`  by default.

## Filesystem Build Caching

There are two types of filesystem build caching.  These greatly improve the time to compile typescript or start webpack between runs.   However, in rare cases bugs may lead to weird broken behavior.  Here's where the caches are, so you know how to clear them to check if this is the source of trouble.   _As of now, I'm_ _**not**_ _aware of any bugs in filesystem caching._

- In the `dist/`  subdirectory of a package, there's a file `tsconfig.tsbuildinfo` that caches incremental typescript builds, so running `tsc` is much faster.  This is enabled by setting `incremental: true` in `tsconfig.json`.  I've never actually seen a case where caching of this file caused a problem (those typescript developers are careful).
- Webpack caches its builds in `/tmp/webpack` .  This is configured in `packages/static/webpack.config.js` , and we use `/tmp` since random access file system performance is critical for this **large** GB+  cache -- otherwise, it's almost slower than no cache.  (I also benchmarked tsc, and it works fine on a potentially slow local filesystem.)   I did sees bugs with this cache when I had some useless antd tree shaking plugin enabled, but I have never seen any problems with it since I got rid of that.
