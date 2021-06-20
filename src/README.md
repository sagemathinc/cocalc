# How to work with this

## Initial build

```sh
npm run make
```

This will do `npm ci` for all packages, and also build the typescript/coffeescript, and anything else into a dist directory for each module.

You can also delete all the `node_modules` and `dist` directories in all packages

```sh
npm run clean
```

## Starting webpack

```sh
npm run webpack
```

That will change to the `packages/static` directory where `npm run webpack` is actually run.

## Starting the development hub

```sh
npm run hub
```

That will ensure the latest version of the hub Typescript and Coffeescript gets compiled, and start a new hub running in the foreground logging what is happening to the console _**and also logging to files in**_ `data/logs/hub` .  Hit Control+C to terminate this server.

## Starting the database

```sh
npm run database
```

## Status of packages

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

## Publishing to NPM

To publish the production version of the static website to npmjs.com, do this:

```sh
npm run publish --packages=static --newversion=minor
```

Where it says `--newversion=`, reasonable options are `"major"`, `"minor"`, and `"patch"`.

**VERY IMPORTANT:** _Do NOT do "`npm publish`" -- the word "run" above is important!!_

## Environment Variables

See `smc-util-node/data.ts` .  In particular, you can set DATA, PGHOST, PGDATA, PROJECTS, SECRETS to override the defaults.  Everything is put in `cocalc/src/data/`  by default.
