# CoCalc's Static Frontend Webapp Assets

Using webpack we build the static assets that run in the client's browser.

## The `npm run` scripts

### Development
When doing development, use `npm run webpack` and `npm run tsc` in two terminals. The first runs webpack to package everything up, and the second independently checks for errors in the typescript files in the `smc-webapp` package (the two should not interfere in any way with each other). If you're using an editor like vscode that tells you Typescript errors, you don't need to bother with `npm run tsc`.

Use `npm run prod` to build and test the production version locally. This is the same as `npm run webpack`, but with more aggressive chunking, caching, minification, etc. It's a good idea to test this before making a release, in case something surprising changes.  Also, check in the Network tab of Chrome dev tools that loading cocalc doesn't transfer too much data (e.g., due to installing a huge package).

### Measuring size

Run `npm run measure` and when it finishes, look at `dist/report.html` for an interactive graphic that
shows how much space each part of CoCalc is using.

### Releases
To make a release, use `npm run build` to create a version with / as the base url that is suitable to deploy on https://cocalc.com and cocalc-docker; this pushes to [npmjs.com](http://npmjs.com), but the version in dist can't be used locally.

## More about development

First we assume you have installed all dev dependencies everywhere for all modules (`npm ci; npm run build`). To do interactive development on CoCalc, you start webpack and typescript in watch mode as follows:

To do development, in one terminal session (in this package/static directory!) start webpack running

```sh
npm run webpack
```
As you edit code, this quickly shows any errors webpack finds in bundling
all your code up.

In a second terminal (also in this package/static directory!), start watching for errors via typescript:

```sh
npm run tsc
```

The files that are produced by webpack, and that your hub serves up are in the subdirectory `dist/`.  The hub server serves these static files to your browser.

## Making a release

When you're ready to make a release of the static part of CoCalc, stop the above watch servers (for development), then do a clean build:

```sh
npm run build
```

This should take a significant amount of time and RAM. Once it is done, be sure to test it using your local CoCalc server (the one running in your project), which will be using the production version of your files. Once you're happy, use npm to publish a new version to npmjs.com. Type `npm help version` for instructions. In particular, you'll likely type

```sh
npm version minor -m "Description of what I did."
```

where `minor` could instead be `major` for breaking changes, `minor` for new features, and `patch` for a bugfix.

## Landmines to watch out for

### The module search path:

If there is a package installed in `packages/static/node_modules` it will get included by webpack before the same (but different version) package in `smc-webapp/node_modules`, because of what we listed in `resolve.modules` in `webpack.config.js`. This can cause confusion. E.g., maybe an old version of the `async` library gets indirectly installed in `packages/static/node_modules`, which is wrong. That's why a specific version of async is installed here. The one good thing about this is it makes it easier to override modules installed in `smc-webapp/` if necessary, like we do with `pdfjs-dist` since otherwise it ends up with its own copy of webpack.

### tsconfig.json and code splitting

Code splitting can't work without this tsconfig.json option:
```js
{
  "compilerOptions": {
    "module": "esnext"
  }
}
```
See https://davidea.st/articles/webpack-typescript-code-split-wont-work
