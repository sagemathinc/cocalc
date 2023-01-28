# CoCalc's Static Frontend Webapp, built using Webpack 5

Using webpack we build the static assets that run in the client's browser
when they are using the CoCalc app, i.e., the single page application with
projects, files, editors, etc.

## Development

When doing development, use `pnpm run tsc` to watch for typescript errors \(or just use VS Code or some other editor with LSP support\).

```sh
pnpm run tsc
```

ALSO, run `pnpm run tsc` in the `packages/frontend` directory, if you are editing that code, which is likely if you're reading this file.

Use `pnpm webpack-prod` to build and test the production version:

```sh
pnpm webpack-prod
```

This is the same as `pnpm run webpack`, but with more aggressive chunking, caching, minification, etc. It's interesting to test this before making a release, in case something surprising changes or to make sure the size of the bundle hasn't got too big. Also, check in the Network tab of Chrome dev tools that loading cocalc doesn't transfer too much data \(e.g., due to installing a huge package\).

If you get really weird errors that make no sense, the on-disk cashing may be broken. In that case, delete it and restart webpack:

```sh
rm -rf /tmp/webpack-`whoami`
```

## Measuring size

Run `pnpm webpack-measure` and when it finishes, look at `dist-measure/measure.html` for an interactive graphic that shows how much space each part of CoCalc is using. Use `pnpm webpack-measure-prod` to see what the situation is for the production build.

## Disabling the webpack dev server

Set the env variable `NO_WEBPACK_DEV_SERVER:`

```sh
~/cocalc/src$ NO_WEBPACK_DEV_SERVER=true pnpm hub
```

You will need to manually build the webpack assets, e.g., via 

```sh
~/cocalc/src/packages/static$ pnpm webpack
```

## More about development

First we assume you have installed all dev dependencies everywhere for all modules \(`pnpm install; pnpm build-dev`\). To do interactive development of CoCalc, you optionally start typescript in watch mode as explained below. If you're using
VS Code its LSP server handles this checking so you can skip this.

To watch for typescript errors, in one terminal session (in this package/static directory!) start webpack running

```sh
# Do this is packages/static:
pnpm tsc
```

In a second terminal (in the packages/frontend directory!), start watching for errors via typescript:

```sh
# Do this is packages/frontend:
pnpm tsc
```

When running the hub in dev mode it uses the webpack dev server middleware
automatically with hot module loading support. This serves the compiled
webapp from memory and also automatically updates it when there are changes.
If there are errors, you'll see them displayed in the webapp via an overlay,
and also in the console where you launched the hub.

**WARNING:** There's a bunch of subtle situations where the hot module reloading
won't properly update the frontend, and there is no easy way to tell. If in
doubt, you may have to refresh your browser. Basically modern-style code using
only react hooks automatically refreshes properly, but older code with Redux
actions, etc., might not.

Note that the hub is ALSO running another copy of webpack at the same time
as part of nextjs, to compile serve the code in packages/next, with server side
rendering. That also supports hot module loading, so there's a lot going on
in the hub all at once!

## :bomb: Landmines to watch out for

### 1. tsconfig.json and code splitting

Code splitting [can't work](https://davidea.st/articles/webpack-typescript-code-split-wont-work) without this tsconfig.json option:

```js
{
  "compilerOptions": {
    "module": "esnext"
  }
}
```

### 2. \[DEPRECATED!\] [npmjs.com](http://npmjs.com) `@cocalc/*` packages

We used to use [npmjs.com](http://npmjs.com) extensively for packaging under the @cocalc org.
**We now do not use that in any way**, so just don't get confused by that.

### 3. Changing code in other packages such as `packages/util`

1. Change something in `packages/util`.
2. You **must** do `pnpm build` in `packages/util` to make the changes visible! This is because anything outside of `packages/util` actually only sees `packages/util/dist` which is the compiled versions of everything. This is a significant change from before. You can also do `pnpm tsc` in `packages/util` to compile and update `dist`.

