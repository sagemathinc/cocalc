# Development inside a CoCalc project

Scripts for doing development of CoCalc inside of a CoCalc project.

**Requirement:** 1.5GB RAM and 1GB disk space

## Initial check

Things you might want to check when starting a new cocalc dev task. Use a .term for these.

- If you think your project has state left over from previous development, you might want to remove or move aside:
  - ~/.local (but see below about installing `forever` command)
  - ~/.smc (you MUST restart your project if you delete this directory)
  - ~/.npm
  - any files in ~/bin that override system commands

- It also helps to restart your project before starting a new dev task, to kill leftover processes and environment settings.
  * If you delete `~/.smc`, you **must** restart your project

## Setup

Make a fork of the cocalc repository (optionally) and then clone via `git clone --recursive git://...`.
You should have a `$HOME/cocalc` directory now.

Run `npm run make` inside the `cocalc/src/` subdirectory.
This will install all the dependencies and does some additional setup.

If you ever need to update dependencies or think there is a problem with them,
just run `npm run clean` to get rid of them and run `npm run make` again.

If, after running `npm run clean`, `which forever` produces empty output, do
```
npm install --prefix=~/.local -g forever
```
before running `npm run make`. (`forever` should be installed globally, though)


## The servers

Explicitly start each of the following scripts in their own terminal session (they will run in the foreground).  Make sure to set the environment with `source smc-env` first:

- `./start_postgres.py`

- `./start_webpack.py`

- `./start_hub.py`


## Information

Type `./info.py` to get the URL where you can reach your own running copy of CoCalc.  This is accessible precisely to collaborators on your project and **nobody** else.

## Running all servers at once with tmux

If you want, you can start several different services at once

    ./tmux-start-all

to create a single tmux session with each of the servers running.

## Changing the web frontend

Try editing smc-webapp/r_help.cjsx, e.g., changing the heading "Support" to something else.  Watch the webpack process notice the change and build.   Refresh your browser and see the change.


## Changing the hub server backend

Edit files in smc-hub, e.g., `hub.coffee`.  Then hit control+c, then run `./start_hub.py` again.  It's slightly faster if you comment out the `./update_schema.coffee` line in `./start_hub.py`, which is safe unless the schema changes.


## Connecting directly to the compute client from command line

Set the environment variable, e.g.,

    \$ . $HOME/cocalc/src/dev/project/postgres-env

From the directory `~/cocalc/cocalc` you can do:

    \$ coffee
    coffee> require './c'; db()

Then use the db object's methods.  After doing the above (or starting the hub once), then the `smc` database will be created, and you can do

    \$ psql smc

Add this line to your ~/.bashrc to set the environment automatically on login:

    . $HOME/cocalc/src/dev/project/postgres-env

## Creating an admin user

You can get the account id's by doing:

    ~/cocalc/src/dev/project$ psql smc
    psql (10devel)
    Type "help" for help.

    smc=# select account_id, email_address, groups from accounts;
                  account_id              |  email_address   | groups
    --------------------------------------+------------------+--------
     c286277f-e856-4a30-a2c7-a2791a9bec79 | wstein@gmail.com |
    (1 row)


Then, to make your user into an admin, do this from the root of your install:

    ~/smc/src$ coffee
    coffee> require 'c'; db()
    coffee> db.make_user_admin(account_id:'c286277f-e856-4a30-a2c7-a2791a9bec79', cb:done())

Now refresh your browser, and in account settings some new admin configuration options will appear in the lower right.  Also, you can open any project (though some things may look messed up).

You can also confirm that you're user is now an admin:

    ~/cocalc/src/dev/project$ psql smc
    psql (10devel)
    Type "help" for help.

    smc=# select account_id, email_address, groups from accounts;
                  account_id              |  email_address   | groups
    --------------------------------------+------------------+---------
     c286277f-e856-4a30-a2c7-a2791a9bec79 | wstein@gmail.com | {admin}

