# Development inside an SMC project

Scripts for doing development of SMC inside of an SMC project.

**Requirement:** 1.5GB RAM and 1GB disk space

## The servers

Explicitly start each of the following scripts in their own terminal session (they will run in the foreground).  Make sure to set the environment with `source smc-env` first:

- `./start_postgres.py`

- `./start_hub.py`

- `./start_webpack.py`

## Information

Type `./info.py` to get the URL where you can reach your own running copy of SMC.  This is accessible precisely to collaborators on your project and **nobody** else.

## Running all servers at once with tmux

If you want, you can start several different services at once

    ./tmux-start-all

to create a single tmux session with each of the servers running.

## Important -- shared ports

In case one of the ports you're using gets **stolen by some other user**, one of the above servers will fail to start.  You can fix this by typing `rm ports/*` then restarting all of the above servers.  This will assign them new random available ports.  Type `./info.py` to find out where your SMC server moved to.


## Changing the web frontend

Try editing smc-webapp/r_help.cjsx, e.g., changing the heading "Support" to something else.  Watch the webpack process notice the change and build.   Refresh your browser and see the change.


## Changing the hub server backend

Edit files in smc-hub, e.g., `hub.coffee`.  Then hit control+c, then run `./start_hub.py` again.  It's slightly faster if you comment out the `./update_schema.coffee` line in `./start_hub.py`, which is safe unless the schema changes.


## Connecting directly to the compute client from command line

Set the environment variable, e.g.,

    \$ . $HOME/smc/src/dev/project/postgres-env

From the directory `~/smc/src` you can do:

    \$ coffee
    coffee> require './c'; db()

Then use the db object's methods.  After doing the above (or starting the hub once), then the `smc` database will be created, and you can do

    \$ psql smc

Add this line to your ~/.bashrc to set the environment automatically on login:

    . $HOME/smc/src/dev/project/postgres-env

## Creating an admin user

You can get the account id's by doing:

    ~/smc/src/dev/project$ psql smc
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

    ~/smc/src/dev/project$ psql smc
    psql (10devel)
    Type "help" for help.

    smc=# select account_id, email_address, groups from accounts;
                  account_id              |  email_address   | groups
    --------------------------------------+------------------+---------
     c286277f-e856-4a30-a2c7-a2791a9bec79 | wstein@gmail.com | {admin}

