# How to Build and Run CoCalc

Updated: **October 2021**

CoCalc is a pretty large and complicated project, and it will only work with the current standard LTS release of node.js (14.x) and a recent version of npm (at least 7.x).

**Node.js and NPM Version Requirements:**

- You must be using Node version 14.x.  **CoCalc will definitely not build with node.js version 12 or earlier AND not with version 16 or later!** In a [CoCalc.com](http://CoCalc.com) project, you can put this in `~/.bashrc`  to get a valid node version:

```sh
. /cocalc/nvm/nvm.sh
```

(NOTE: Probably the only reason CoCalc doesn't work on Node 16.x is that Next.js doesn't; however, that [will be fixed](https://github.com/vercel/next.js/pull/28710) in their next release.)

- You must using npm 7.x or 8.x.  **CoCalc will definitely build with npm 6.x or yarn.**  You can do this to get a working version of npm.  This isn't necessary in a cocalc project if you sourced `nvm.sh` as above.

```sh
npm install -g npm@latest
```

## Initial Build

```sh
~/cocalc/src$ npm run make
```

This will do `npm ci` for all packages, and also build the typescript/coffeescript, and anything else into a dist directory for each module. Once `npm run make` finishes successfully, you can start using CoCalc by starting the database and the backend hub in two separate terminals.

```sh
~/cocalc/src$ npm run database # in one terminal
~/cocalc/src$ npm run hub      # in another terminal
```

The hub will send minimal logging to stdout, and the rest to `data/logs/log`.

### Starting All Over

If necessary, you can delete all the `node_modules` and `dist` directories in all packages and start over as follows:

```sh
~/cocalc/src$ npm run clean
```

## Doing Development

The code of CoCalc is in NPM packages in the `src/packages/` subdirectory. To do development you need to ensure each of the following are running:

1. Static Frontend Webpack server
2. PostgreSQL database
3. Hub

Optionally, you may also type `npm run tsc` in most packages to watch for changes, compile using Typescript and show an errors.

### 1. Starting the Frontend Webpack Server

The frontend webpack server compiles and bundles CoCalc's frontend code into static Javascript files, so that your browser can read it.   Start the frontend webpack server as follows:

```sh
~/cocalc/src$ npm run static
```

That will change to the `packages/static` directory where `npm run webpack` is actually run. This will package up all the React.js, etc. files needed for the frontend -- the actual files are served via the Hub.  As you edit files in packages/frontend, this service will automatically compile and bundle them.

Note that webpack does NOT check for Typescript errors.  For that, you must run `npm run tsc` in either `packages/frontend` or `packages/static`, depending on what code you are editing.   See the README in `packages/static` for more details.

### 2. Starting the Database

CoCalc stores all of its data in a PostgreSQL database.  Start your PostreSQL database server as follows:

```sh
~/cocalc/src$ npm run database
```

The database runs in the foreground and logs basic information.  It serves via a "Unix domain socket", i.e., something that looks like a file.  If you set the environment variables `PGUSER` and `PGHOST` as follows, you can use `psql` to connect to the database:

```sh
~/cocalc/src$ export PGUSER='smc'; export PGHOST=`pwd`/data/postgres/socket
~/cocalc/src$ psql
psql (10.17 (Ubuntu 10.17-1.pgdg20.04+1))
Type "help" for help.

smc=# \d
                 List of relations
 Schema |           Name           | Type  | Owner 
--------+--------------------------+-------+-------
 public | account_creation_actions | table | smc
 public | accounts                 | table | smc
 ...
```

You can also just type `npm run psql` :

```sh
~/cocalc/src$ npm run psql
```

NOTE: I think CoCalc should fully work with any version of PostgreSQL from version 10.x onward.

### 3. Starting the Hub

The Hub is CoCalc's backend node.js server.

```sh
~/cocalc/src/packages/hub$ npm run hub-project-dev
```

That will ensure the latest version of the hub Typescript and Coffeescript gets compiled, and start a new hub running in the foreground logging what is happening to the console _**and also logging to files in**_ `data/logs/hub` .  Hit Control+C to terminate this server.  If you change any code in `packages/hub`, you have to stop the hub, then start it  again as above in order for the changes to take effect.

### 4. Building only what has changed

The command `npm run build`, when run from the src directory, caches the fact that there was a successful build by touching a file `src/packages/package-name/.successful_build` .  This _only_ does anything if you explicitly use the `npm run build` command from the src/ directory, and is ignored when directly building in a subdirectory. You can do `npm run build --exclude=static` periodically to rebuild precisely what needs to be built, except what is built using webpack (e.g., via `npm run static` as explained above):

```sh
~/cocalc/src/$ npm run build --exclude=static
```

This is very useful if you pull in a git branch or switch to a different git branch, and have no idea which packages have changed.

### Other

#### Environment Variables

See `packages/backend/data.ts` .  In particular, you can set BASE\_PATH, DATA, PGHOST, PGDATA, PROJECTS, SECRETS to override the defaults.  Data is stored in `cocalc/src/data/`  by default.

#### Filesystem Build Caching

There are two types of filesystem build caching.  These greatly improve the time to compile typescript or start webpack between runs.   However, in rare cases bugs may lead to weird broken behavior.  Here's where the caches are, so you know how to clear them to check if this is the source of trouble.   _As of now, I'm_ _**not**_ _aware of any bugs in filesystem caching._

- In the `dist/`  subdirectory of a package, there's a file `tsconfig.tsbuildinfo` that caches incremental typescript builds, so running `tsc` is much faster.  This is enabled by setting `incremental: true` in `tsconfig.json`.  I've never actually seen a case where caching of this file caused a problem (those typescript developers are careful).
- Webpack caches its builds in `/tmp/webpack` .  This is configured in `packages/static/webpack.config.js` , and we use `/tmp` since random access file system performance is critical for this **large** GB+  cache -- otherwise, it's almost slower than no cache.  (I also benchmarked tsc, and it works fine on a potentially slow local filesystem.)   I did sees bugs with this cache when I had some useless antd tree shaking plugin enabled, but I have never seen any problems with it since I got rid of that.

## Packages

### Get the Status of Packages

By "status" we just mean what the git diff is from when the package was last published to npmjs.

```sh
~/cocalc/src$ npm run status
```

or to just see status for a specific package or packages

```sh
~/cocalc/src$ npm run status --packages=static,frontend
```

This uses git and package.json to show you which files (in the package directory!) have changed since this package was last published to npmjs.  To see the diff:

```sh
~/cocalc/src$ npm run diff
```

### Publishing to [NPMJS.com](http://NPMJS.com)

To publish a package `foo` (that is in \`src/packages/foo\`) to [npmjs.com](http://npmjs.com), do this:

```sh
~/cocalc/src$ npm run update-version --packages=foo --newversion=patch  # patch, minor, major, etc.
~/cocalc/src$ npm run publish --packages=foo                            # optional --tag=mytag
```

Where it says `--newversion=`, reasonable options are `"major"`, `"minor"`, and `"patch"`.  There is a handy script `src/scripts/publish` that combines the two steps above.

When publishing the versions of all workspace dependencies are updated to whatever is in your current cocalc branch.   Thus if you publish a major version update to one package, then when you publish the packages that depend on it, they will explicitly be set to depend on that new major version.

#### Tips:

- **VERY IMPORTANT:** _Do NOT do just do "_**npm publish**_" -- the word "run" above is important!!_
- **Webpack:** When publishing the `static` packages, be sure to stop the `npm run static`  webpack server first, since it's not good having two different processes writing to packages/static/dist at the same time.  Similar remarks probably apply to the hub serving the next.js app (which serves /share and the landing pages).
- **Semver:** If you publish a new (presumably incompatible) **major**  version of a CoCalc package `foo`  and there is another package `bar`   that depends on it, then you have to also publish a new version of `bar`.  Otherwise, `bar` explicitly says in package.json that it doesn't want the new major version of foo yet.  For example, support use update `util` with some major non-bugfix change, and the static frontend server depends on this change.  You need to publish a new version of `static` or when `static` gets installed, it'll just install the old version of `util`.  This makes sense in general, since major changes are breaking changes.
