# Development inside an SMC project

Scripts for doing development of SMC inside of an SMC project.

## The servers

Type

    ./tmux-start-all

to create a single tmux session with each of the servers running.  Alternatively, explicitly start each of the following scripts in their own terminal session (they will run in the foreground):

- `./start_rethinkdb.py`

- `./start_hub.py`

- `./start_webpack.py`

## Information

Type `./info.py` to get the URL where you can reach your own running copy of SMC.  This is accessible precisely to collaborators on your project and **nobody** else.

## Important -- shared ports

In case one of the ports you're using gets **stolen by some other user**, one of the above servers will fail to start.  You can fix this by typing `rm ports/*` then restarting all of the above servers.  This will assign them new random available ports.  Type `./info.py` to find out where your SMC server moved to.


## Changing the web frontend

Try editing smc-webapp/r_help.cjsx, e.g., changing the heading "Support" to something else.  Watch the webpack process notice the change and build.   Refresh your browser and see the change.


## Changing the hub server backend

Edit files in smc-hub, e.g., `hub.coffee`.  Then hit control+c, then run `./start_hub.py` again.  It's slightly faster if you comment out the `./update_schema.coffee` line in `./start_hub.py`, which is safe unless the schema changes.