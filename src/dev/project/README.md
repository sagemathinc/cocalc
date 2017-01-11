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

Determine the port of postgreSQL:

    \$ cd ~/smc/src
    \$ cat dev/project/ports/postgres
    51974

Then use it:

    \$ psql -p 51974 smcdev

or from the directory `~/smc/src`:

    \$ coffee
    coffee> require './c'; db()

Add this to your ~/.bashrc, where you get the port as above:

    cd ~/smc/src; source smc-env
    export SMC_DB_HOST=localhost:`cat ~/smc/src/dev/project/ports/postgres`

## Creating an admin user

** IMPORTANT TODO -- rewrite for postgreSQL!!!! **

You can get your account id by typing `./info.py` in `dev/project` and logging in to your own SMC server, then typing `smc.client.account_id` in the JavaScript console.  You might see something like "86b29017-644e-481d-aac2-c14ea52b930c" as output.  Then, to make your user and admin, do this from the root of your install:

    ~/smc/src$ coffee
    coffee> require 'c'; db()
    coffee> db.table('accounts').get('86b29017-644e-481d-aac2-c14ea52b930c').update(groups:['admin']).run(done())

or to make ALL current users admins, just do

    coffee> db.table('accounts').update(groups:['admin']).run(done())

Now refresh your browser, and in account settings some new admin configuration options will appear in the lower right.  Also, you can open any project (though some things will look messed up).
