#!/usr/bin/env python3
"""
This is a script that is useful for debugging why a project crashes
on startup when logfiles are not sufficient.

When a project starts the hub also writes a file ~/.smc/launch-param.json,
where ~ is the HOME directory of the project.  This launch-params.json
records the command, args, environment and working directory used to
launch the project.  Using the script you're reading now, you can
manually launch the project, but in the foreground in your terminal,
and see what's going on when it "mysteriously crashes".

To use this script:

    ./run-project.py /path/to/launch-params.json

The purpose of this script is just to help in figuring out why a project
starts up and then JUST CRASHES for mysterious reasons.
"""

import json, subprocess, os, sys
from datetime import datetime, timezone


def print_time():
    current_time = datetime.now(timezone.utc)
    formatted_time = current_time.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    print(formatted_time)


def run_command_with_params(params):
    # Get the command, args, and cwd from the params
    cmd = params["cmd"]
    args = params["args"]
    #args = [x for x in args if 'daemon' not in x]
    cwd = params["cwd"]

    # Get the environment variables from the params
    env = params["env"]
    if 'DEBUG' not in env:
        env['DEBUG'] = 'cocalc:*'
    env['DEBUG_CONSOLE'] = 'yes'

    # Convert the environment dictionary to a list of key=value strings
    env_list = [f"{key}={value}" for key, value in env.items()]

    print(
        "Running the following command with the environment setup for the project:\n"
    )
    print(" ".join([cmd] + args))
    try:
        # Run the command with the specified arguments and environment in the given cwd
        subprocess.run([cmd] + args,
                       cwd=cwd,
                       env=dict(os.environ, **env),
                       check=True)
    except subprocess.CalledProcessError as e:
        print(f"Command execution failed with error code {e.returncode}.")
        # Handle the error as needed


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"USAGE: {sys.argv[0]} /path/to/launch-params.json")
        sys.exit(1)
    try:
        print_time()
        # Read the JSON data from the file
        with open(sys.argv[1], "r") as file:
            params = json.load(file)
        run_command_with_params(params)
    except FileNotFoundError:
        print(f"File '{sys.argv[1]}' not found.")
    except json.JSONDecodeError:
        print("Error parsing JSON data from the file.")
