# Developing SMC on a personal laptop

TODO: This will not work since it needs to be updated for PostgreSQL.
See the dev/single for hints.

Scripts for doing development of SMC on a personal single-user laptop
that you fully control.  You _**must not**_ have anything else listening
on ports 5000, 5001, 8080, 28015 and 29015.


## Prerequisites:

- Make sure that the `python` in the PATH is Python version 2.7
- Install Node.js version 6.x.
- Install the forever npm node package: `sudo npm install -g forever`
- Install RethinkDB >= 2.1.5
  - Installation from source works using the usual
    `./configure && make && make install`
  - RethinkDB has a strange way of detecting the C/C++ compiler:
    it's best to explicitly `export CC=gcc CXX=g++` or whatever compiler
    you want to use.
  - NOTE: RethinkDB actually contains various other packges which are
    also installed.
- Install the yaml Python module: `pip install pyyaml --user`


## Build SMC

From the `src/` directory:

- run `source smc-env && npm run make`

## Install the Python libraries

From the `src/` directory, run

    pip install --user --upgrade smc_sagews/
    pip install --user --upgrade smc_pyutil/


## The servers

Explicitly start each of the following scripts in their own terminal session
(they will run in the foreground).
Make sure to set the environment with `source smc-env` first:

- `source smc-env && cd dev/laptop && ./start_rethinkdb.py`

- `source smc-env && cd dev/laptop && ./start_hub.py`

- `source smc-env && cd dev/laptop && ./start_webpack.py`


##  Running all servers at once with tmux

Type `./tmux-start-all` to create a single tmux session with each of
the servers running.


## Use it

Your local SMC server should be running at `http://localhost:5000`

## Changing the web frontend

Try editing smc-webapp/r_help.cjsx, e.g., changing the heading "Support" to something else.  Watch the webpack process notice the change and build.   Refresh your browser and see the change.


## Changing the hub server backend

Edit files in smc-hub, e.g., `hub.coffee`.  Then hit control+c, then run `./start_hub.py` again.  It's slightly faster if you comment out the `./update_schema.coffee` line in `./start_hub.py`, which is safe unless the schema changes.
