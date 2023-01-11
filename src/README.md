# How to Build and Run CoCalc

Updated: **Jan 2023**

CoCalc is a pretty large and complicated project, and it will only work with the current standard LTS release of node.js \( at least 16.8.x\) and a recent version of [pnpm](https://pnpm.io/).

**Node.js and NPM Version Requirements:**

- You must be using Node version 16.8.x or newer. **CoCalc will definitely NOT work with any older version!** In a [CoCalc.com](http://CoCalc.com) project, you can put this in `~/.bashrc` to get a valid node version:

```sh
. /cocalc/nvm/nvm.sh
```

- Make sure to[install the newest version of pnpm as well;](https://pnpm.io/installation) one way to do that is as follows:

```sh
npm install -g pnpm
```

- Python: You must have python3 installed with the pyyaml package, so `import yaml` works. Do `pip3 install pyyaml` if not.

## Initial Build

Launch the full build:

```sh
~/cocalc/src$ pnpm make
```

This will do `pnpm install` for all packages, and also build the typescript/coffeescript, and anything else into a dist directory for each module. Once `pnpm make` finishes successfully, you can start using CoCalc by starting the database and the backend hub in two separate terminals.

```sh
~/cocalc/src$ pnpm database # in one terminal
~/cocalc/src$ pnpm hub      # in another terminal
```

The hub will send minimal logging to stdout, and the rest to `data/logs/log`.

If you're only going to do development and 

### Starting All Over

If necessary, you can delete all the `node_modules` and `dist` directories in all packages and start over as follows:

```sh
~/cocalc/src$ pnpm clean
```

## Doing Development

The code of CoCalc is in NPM packages in the `src/packages/` subdirectory. To do development you need to ensure each of the following are running:

1. Static Frontend Webpack server
2. PostgreSQL database
3. Hub

Optionally, you may also type `pnpm tsc` in most packages to watch for changes, compile using Typescript and show an errors.

### 1. Starting the Frontend Webpack Server

The frontend webpack server compiles and bundles CoCalc's frontend code into static Javascript files, so that your browser can read it. Start the frontend webpack server as follows:

```sh
~/cocalc/src$ pnpm static
```

That will change to the `packages/static` directory where `pnpm webpack` is actually run. This will package up all the React.js, etc. files needed for the frontend -- the actual files are served via the Hub. As you edit files in packages/frontend, this service will automatically compile and bundle them.

Note that webpack does NOT check for Typescript errors. For that, you must run `pnpm tsc` in either `packages/frontend` or `packages/static`, depending on what code you are editing. See the README in `packages/static` for more details.

### 2. Starting the Database

CoCalc stores all of its data in a PostgreSQL database. Start your PostreSQL database server as follows:

```sh
~/cocalc/src$ pnpm database
```

The database runs in the foreground and logs basic information. It serves via a "Unix domain socket", i.e., something that looks like a file. If you set the environment variables `PGUSER` and `PGHOST` as follows, you can use `psql` to connect to the database:

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

You can also just type `pnpm psql` :

```sh
~/cocalc/src$ pnpm psql
```

NOTE: I think CoCalc should fully work with any version of PostgreSQL from version 10.x onward.

### 3. Starting the Hub

The Hub is CoCalc's backend node.js server.

```sh
~/cocalc/src/packages/hub$ pnpm hub-project-dev
```

That will ensure the latest version of the hub Typescript and Coffeescript gets compiled, and start a new hub running in the foreground logging what is happening to the console _**and also logging to files in**_ `data/logs/hub` . Hit Control+C to terminate this server. If you change any code in `packages/hub`, you have to stop the hub, then start it again as above in order for the changes to take effect.

### 4. Building only what has changed

The command `pnpm build`, when run from the src directory, caches the fact that there was a successful build by touching a file `src/packages/package-name/.successful_build` . This _only_ does anything if you explicitly use the `pnpm build` command from the src/ directory, and is ignored when directly building in a subdirectory. You can do `pnpm build --exclude=static` periodically to rebuild precisely what needs to be built, except what is built using webpack (e.g., via `pnpm static` as explained above):

```sh
~/cocalc/src/$ pnpm build --exclude=static
```

This is very useful if you pull in a git branch or switch to a different git branch, and have no idea which packages have changed.

Sometime when you pull in a branch, you need to make sure exactly the right packages are installed and everything is built before doing `pnpm static` and `pnpm hub` . The simplest way to do this is

```sh
~/cocalc/src/$ pnpm make-dev
```

which installs exactly the right packages (via `npm ci` in all package dirs), and building the code except in the static and next packages, which will takes a long time and would get done when you do `pnpm static` anyways.

### Other

#### Environment Variables

See `packages/backend/data.ts` . In particular, you can set BASE_PATH, DATA, PGHOST, PGDATA, PROJECTS, SECRETS to override the defaults. Data is stored in `cocalc/src/data/` by default.

#### Filesystem Build Caching

There are two types of filesystem build caching. These greatly improve the time to compile typescript or start webpack between runs. However, in rare cases bugs may lead to weird broken behavior. Here's where the caches are, so you know how to clear them to check if this is the source of trouble. _As of now, I'm_ _**not**_ _aware of any bugs in filesystem caching._

- In the `dist/` subdirectory of a package, there's a file `tsconfig.tsbuildinfo` that caches incremental typescript builds, so running `tsc` is much faster. This is enabled by setting `incremental: true` in `tsconfig.json`. I've never actually seen a case where caching of this file caused a problem (those typescript developers are careful).
- Webpack caches its builds in `/tmp/webpack` . This is configured in `packages/static/webpack.config.js` , and we use `/tmp` since random access file system performance is critical for this **large** GB+ cache -- otherwise, it's almost slower than no cache. (I also benchmarked tsc, and it works fine on a potentially slow local filesystem.) I did sees bugs with this cache when I had some useless antd tree shaking plugin enabled, but I have never seen any problems with it since I got rid of that.

#### Creating an admin user

It is handy to have a user with admin rights in your dev cocalc server. With the database running you can make a `user@example.com` an admin as follows:

```sh
~/cocalc/src$ pnpm run c
> db.make_user_admin({email_address:'user@example.com', cb:console.log})
```

Admin users have an extra tab inside the main cocalc app labeled "Admin" where they can configure many aspects of the server, search for users, etc.

## Packages on [NPMJS.com](http://NPMJS.com)

There's some `@cocalc/` packages at [NPMJS.com](http://NPMJS.com). However, we're no longer going to use
them in any way, and don't plan to publish anything new unless there
is a compelling use case.

