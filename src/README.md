# How to Build and Run CoCalc

**Updated: Feb 2025**

CoCalc is a pretty large and complicated project, and it will only work with the current standard LTS release of node.js \( at least 18.17.1\) and a recent version of [pnpm](https://pnpm.io/).  Also, you will need a LOT of RAM, a minimum of 16 GB.   **It's very painful to do development with less than 32 GB of RAM.**

**Node.js and NPM Version Requirements:**

- You must be using Node version 18.17.1 or newer. **CoCalc will definitely NOT work with any older version!** In a [CoCalc.com](http://CoCalc.com) project, you can put this in `~/.bashrc` to get a valid node version:

```sh
. /cocalc/nvm/nvm.sh
```

Alternatively, if you are already using [Node Version Manager](https://github.com/nvm-sh/nvm), you can simply run the
following command to use a version of Node guaranteed to work with this project:

```sh
~/cocalc/src$ nvm install && nvm use
```

_Note that `nvm install` is only required the first time you run this command or when CoCalc's Node version changes_.

- Make sure to [install the newest version of pnpm as well;](https://pnpm.io/installation) one way to do that is as follows:

```sh
npm install -g pnpm
```

Alternatively, if you do not wish to install `pnpm` globally, you can run `npm install` to install it as a dev 
dependency.

**Python virtual environment**

Some features of CoCalc (e.g., file creation) require local Python modules to be installed. To create a [Python virtual 
environment](https://docs.python.org/3/library/venv.html) from which to run these modules, run (from the `src` 
directory):

```sh
~/cocalc/src$ python3 -m venv venv
```

To activate the virtual environment, run

```sh
~/cocalc/src$ source ./venv/bin/activate
```

To install required dependencies, run

```sh
(venv) ~/cocalc/src$ pip install -r requirements.txt
```

**You must have your virtual environment activated when running the CoCalc Hub (via `pnpm hub`)!** If, on the other
hand, you prefer that development packages be installed globally, you can jump directly to the above `pip install` 
command outside the context of a virtual environment.

## Build and Start

Launch the install and build **for doing development.**

If you export the PORT environment variable, that determines what port everything listens on.  This determines subtle things about configuration, so do this once and for all in a consistent way.

CoCalc also runs a NATS server listening on two ports on localhost, one for TCP and one for WebSocket connections.  To avoid conflicts, you can customize their ports by setting the environment variables `COCALC_NATS_PORT` (default 4222), and `COCALC_NATS_WS_PORT` (default 8443).


**Note**: If you installed `pnpm` locally (instead of globally), simply run `npm run` in place of `pnpm` to execute
these commands via [NPM run scripts](https://docs.npmjs.com/cli/v10/using-npm/scripts).

```sh
~/cocalc/src$ pnpm build-dev
```

This will do `pnpm install` for all packages, and also build the typescript/coffeescript, and anything else into a dist directory for each module. Once `pnpm build-dev` finishes successfully, you can start using CoCalc by starting the database, nats server and the backend hub in three terminals.  \(Note that 'pnpm nats\-server' will download, install and configure NATS automatically.\)  You can start the database, nats\-server and hub in any order.

```sh
~/cocalc/src$ pnpm database    # in one terminal
~/cocalc/src$ pnpm nats-server # in one terminal
~/cocalc/src$ pnpm hub         # in another terminal
```

The hub will send minimal logging to stdout, and the rest to `data/logs/log`.

To get real-time updates from, e.g., the `packages/server` directory, you'll also need to run

```sh
~/cocalc/src/packages/server$ pnpm tsc # in yet another terminal
```

If you need to do a production build instead:

```sh
~/cocalc/src$ pnpm make
```

The main \(only?\) difference is that static and next webpack builds are created in production mode, which takes much longer.

### Starting All Over

If necessary, you can delete all the `node_modules` and `dist` directories in all packages and start over as follows:

```sh
~/cocalc/src$ pnpm clean && pnpm build-dev
```

## Doing Development

The code of CoCalc is in NPM packages in the `src/packages/` subdirectory. To do development you need to ensure each of the following two services are running, as explained above:

1. **PostgreSQL** database \-\- a postgres instance started via `pnpm database` 
2. **Hub** \-\- a nodejs instance started via `pnpm hub` 

Optionally, you may also need to type `pnpm tsc` in packages that you're editing to watch for changes, compile using Typescript and show an errors.

### 1. More about Starting the Database

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

NOTE:  As of Jan 2023, CoCalc should fully work with any version of PostgreSQL from version 10.x onward.  However, obviously at some point we will stop supporting PostgreSQL v 10.

### 2. More about Starting the Hub

The Hub is CoCalc's backend node.js server.  You can start it from its package directory as follows:

```sh
~/cocalc/src/packages/hub$ pnpm hub-project-dev
```

That will ensure the latest version of the hub Typescript and Coffeescript gets compiled, and start a new hub running in the foreground logging what is happening to the console _**and also logging to files in**_ `cocalc/src/data/logs/hub` . Hit Control\+C to terminate this server. If you change any code in `packages/hub`, you have to stop the hub, then start it again as above in order for the changes to take effect.

The hub itself is running two copies of webpack along with two separate "Hot Module Replacement" servers, etc.   One is for the `/static` endpoint \(see packages/static and packages/frontend\) and the other is for the nextjs server \(see packages/next\).

### 3. Building only what has changed

The command `pnpm build (or build-dev)`, when run from the src directory, caches the fact that there was a successful build by touching a file `src/packages/package-name/.successful_build` . This caching _only_ does anything if you explicitly use the `pnpm build` command from the src/ directory, and is ignored when directly building in a subdirectory. You can do `pnpm build --exclude=static` periodically to rebuild precisely what needs to be built, except what is built using webpack \(e.g., via `pnpm static` as explained above\):

```sh
~/cocalc/src/$ pnpm build --exclude=static
```

This is useful if you pull in a git branch or switch to a different git branch, and have no idea which packages have changed.  That said, it's always much safer to just do the following instead of relying on this:

```sh
~/cocalc/src/$ pnpm clean && pnpm make-dev
```

In particular, this will make sure exactly the right packages are installed and everything is built before doing `pnpm static` and `pnpm hub` . The simplest way to do this is

```sh
~/cocalc/src/$ pnpm make-dev
```

which installs exactly the right packages, and builds the code.

### Other

#### Environment Variables

See `packages/backend/data.ts` . In particular, you can set BASE_PATH, DATA, PGHOST, PGDATA, PROJECTS, SECRETS to override the defaults. Data is stored in `cocalc/src/data/` by default.

#### File System Build Caching

There are two types of file system build caching. These greatly improve the time to compile typescript or start webpack between runs. However, in rare cases bugs may lead to weird broken behavior. Here's where the caches are, so you know how to clear them to check if this is the source of trouble. _As of now, I'm_ _**not**_ _aware of any bugs in file system caching._

- In the `dist/` subdirectory of a package, there's a file `tsconfig.tsbuildinfo` that caches incremental typescript builds, so running `tsc` is much faster. This is enabled by setting `incremental: true` in `tsconfig.json`. I've never actually seen a case where caching of this file caused a problem (those typescript developers are careful).
- Webpack caches its builds in `/tmp/webpack` . This is configured in `packages/static/webpack.config.js` , and we use `/tmp` since random access file system performance is critical for this **large** GB+ cache -- otherwise, it's almost slower than no cache. (I also benchmarked tsc, and it works fine on a potentially slow local file system.) I did sees bugs with this cache when I had some useless antd tree shaking plugin enabled, but I have never seen any problems with it since I got rid of that.

#### Creating an admin user

It is handy to have a user with admin rights in your dev cocalc server. With the database running you can make a `user@example.com` an admin as follows:

```sh
~/cocalc/src$ pnpm install -D express && pnpm run c
...
> db.make_user_admin({email_address:'user@example.com', cb:console.log})
...
```

Admin users have an extra tab inside the main cocalc app labeled "Admin" where they can configure many aspects of the server, search for users, etc.

#### IDE file autosave settings

During development, Next.js and Webpack will eagerly compile your code changes and hot-reload the page you're working with.
If your IDE automatically saves files very quickly, this will be very intensive, causing a lot of CPU and disk usage.
Hence **we recommend to tame or disable autosaving files**.

Regarding VS Code, the relevant settings can be found by searching for "autosave" – or to be more precise, this is recommended:

```json
"files.autoSave": "afterDelay"
"files.autoSaveDelay": 10000
```

## Packages on [NPMJS.com](http://NPMJS.com) \(DEPRECATED\)

There's some `@cocalc/` packages at [NPMJS.com](http://NPMJS.com). However, _**we're no longer using**_
_**them in any way**_, and don't plan to publish anything new unless there
is a compelling use case.

