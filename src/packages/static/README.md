# CoCalc's Static Frontend Webapp Assets

Using webpack we build the static assets that run in the client's browser.

## The `npm run` scripts

### 1. Development

When doing development, use `npm run webpack` and `npm run tsc-webapp` and `npm run tsc-static` in three terminals.

```sh
npm run weppack
npm run tsc-webapp
npm run tsc-static
```

The first runs webpack to package everything up, the second independently checks for errors in the typescript files in the `smc-webapp` package (the two should not interfere in any way with each other), and the third does the same for code in `packages/static/src`. If you're using an editor like vscode that tells you Typescript errors, you don't need to bother with `npm run tsc-*`.

Use `npm run webpack-prod` to build and test the production version locally:

```sh
npm run webpack-prod
```

This is the same as `npm run webpack`, but with more aggressive chunking, caching, minification, etc. It's a good idea to test this before making a release, in case something surprising changes.  Also, check in the Network tab of Chrome dev tools that loading cocalc doesn't transfer too much data (e.g., due to installing a huge package).

If you get really weird errors that make no sense, the on-disk cashing may be broken.  In that case, delete it and restart webpack:

```sh
rm -rf /tmp/webpack
```

### 2. Measuring size

Run `npm run webpack-measure` and when it finishes, look at `dist-measure/measure.html` for an interactive graphic that shows how much space each part of CoCalc is using.  Use `npm run webpack-measure-prod` to see what the situation is for the production build.

It's often useful to do:

```sh
ls -lh dist/*.js |more
```

### 3. Making a release to npmjs

Make sure to kill any running webpack first.  Everything to make a release is automated by going to `~/cocalc/src` and using `npm run publish ...`:

```sh
$ cd ../..
$ pwd
/home/user/cocalc/src
$ time npm run publish --packages=static --newversion=minor
```

Here `newversion` could be major, minor, or patch.  This does a full production build, updates 
the version in `package.json`, then pushes the result to npmjs.com, and commits the change 
to package.json to git.

If you want to make a _development release,_ e.g., to make it easier to debug something on [test.cocalc.com](http://test.cocalc.com), do

```sh
time NODE_ENV=development npm run publish --packages=static --newversion=minor
```

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
npm run tsc-webapp
```

The files that are produced by webpack, and that your hub serves up are in the subdirectory `dist/`.  The hub server serves these static files to your browser.

If you're editing Typescript files in `src/`, you should also run

```sh
npm run tsc-static
```

which will check those files for typescript errors.

## Landmines to watch out for

### The module search path:

If there is a package installed in `packages/static/node_modules` it will get included by webpack before the same (but different version) package in `smc-webapp/node_modules`, because of what we listed in `resolve.modules` in `webpack.config.js`. This can cause confusion. E.g., maybe an old version of the `async` library gets indirectly installed in `packages/static/node_modules`, which is wrong. That's why a specific version of async is installed here. The one good thing about this is it makes it easier to override modules installed in `smc-webapp/` if necessary, like we do with `pdfjs-dist` since otherwise it ends up with its own copy of webpack.

### tsconfig.json and code splitting

Code splitting [can't work](https://davidea.st/articles/webpack-typescript-code-split-wont-work) without this tsconfig.json option:

```js
{
  "compilerOptions": {
    "module": "esnext"
  }
}
```

### Changing code in other packages such as `smc-util`

1. Change something in `smc-util`.
2. You **must** do `npm run build` in `smc-util` to make the changes visible to webpack!  This is because anything outside of `smc-util` actually only sees `smc-util/dist` which is the compiled versions of everything.   This is a significant change from before.
