# Development inside a CoCalc project

Notes for doing development inside a cocalc project.

## Initial check

Things you might want to check when starting a new cocalc dev task. Use a .term for these.

- If you think your project has state left over from previous development, you might want to remove or move aside:
  - ~/.local (but see below about installing `forever` command)
  - ~/.smc (you MUST restart your project if you delete this directory)
  - ~/.npm
  - any files in ~/bin that override system commands

- It also helps to restart your project before starting a new dev task, to kill leftover processes and environment settings.
  - If you delete `~/.smc`, you **must** restart your project

## Setup

Make a fork of the cocalc repository (optionally) and then clone via `git clone --recursive git://...`.
You should have a `$HOME/cocalc` directory now.

Run `npm run make` inside the `cocalc/src/` subdirectory.This will install all the dependencies and does some additional setup. See `cocalc/src` for more discussion.

If you ever need to update dependencies or think there is a problem with them,
just run `npm run clean` to get rid of them and run `npm run make` again.

## The servers

In order to use CoCalc in your dev project, start the database and the hub.  Then visit `https://cocalc.com/[project_id]/port/5000/` .  Note the slash at the end.  This URL is accessible precisely to collaborators on your project and **nobody** else; in particular, it is NOT public.

#### 1. The Database

Make sure to set the environment with `source smc-env` first from `~/cocalc/src` , then type `./start_postgres.py` here.

#### 2. The Hub

In `/cocalc/src` type `npm run hub`.  If you need to change the port from 5000 to something else, set the env variable `PORT` before starting the hub.

## Changing the web frontend

To see your changes when doing frontend development, type `npm run webpack` in `packages/static`.  See the [README.md](http://README.md) in `packages/static` for more details.

## Changing the hub server backend

Edit files in smc-hub, e.g., `hub.coffee`.  Then hit control+c, then run `npm run hub` again. 

## Connecting directly to the compute client from command line

Set the environment variable, e.g.,

    > . $HOME/cocalc/src/dev/project/postgres-env
    > . smc-env

From the directory `~/cocalc/src` you can do:

    > coffee
    coffee> require './c'; db()

Then use the db object's methods.  After doing the above (or starting the hub once), then the `smc` database will be created, and you can do

    > psql

Add this line to your ~/.bashrc to set the environment automatically on login:

    . $HOME/cocalc/src/dev/project/postgres-env

## Creating an admin user

You can get the account emails & id's by doing:

    psql -c 'select account_id, email_address, groups from accounts'

                  account_id              |  email_address   | groups
    --------------------------------------+------------------+--------
     c286277f-e856-4a30-a2c7-a2791a9bec79 | wstein@gmail.com |
    (1 row)

Then, to make your user into an admin, do this from the root of your install:

    ~/cocalc/src/scripts/make-user-admin wstein@gmail.com

Obviously, you should make the user you created (with its email address) an admin, not `wstein@gmail.com` .

Now refresh your browser, and in account settings some new admin configuration options will appear in the lower right.  Also, you can open any project (though some things may look messed up).

You can also confirm that your user is now an admin:

    psql smc -c 'select account_id, email_address, groups from accounts'

                  account_id              |  email_address   | groups
    --------------------------------------+------------------+---------
     c286277f-e856-4a30-a2c7-a2791a9bec79 | wstein@gmail.com | {admin}

## Connecting to the test instance from an automated client

This technique is useful for making API calls or running puppeteer scripts on your test instance of CoCalc. The calls must come from code running in the project that is running the instance.

Use the following URL modifications.

API call:

    http://localhost:39187/92234d52-8a1c-4e63-bde3-f2727f5ab8b1/port/5000/api/v1/query

Puppeteer page fetch:

    http://localhost:39187/92234d52-8a1c-4e63-bde3-f2727f5ab8b1/port/5000/app

NOTES:

- It's not https encrypted
- The explicit port is used (:5000)
