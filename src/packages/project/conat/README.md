How to setup a standalone nodejs command line session to connect to conat **as a project**

1. Create a file project-env.sh as explained in projects/conat/README.md, which defines these environment variables (your values will be different). You can use the command `export` from within a terminal in a project to find these values.

```sh
export CONAT_SERVER="http://localhost:5000/6b851643-360e-435e-b87e-f9a6ab64a8b1/port/5000"
export COCALC_PROJECT_ID="00847397-d6a8-4cb0-96a8-6ef64ac3e6cf"
export COCALC_USERNAME=`echo $COCALC_PROJECT_ID | tr -d '-'`
export HOME="/projects/6b851643-360e-435e-b87e-f9a6ab64a8b1/cocalc/src/data/projects/$COCALC_PROJECT_ID"
export DATA=$HOME/.smc

# optional for more flexibility

export API_KEY=sk-OUwxAN8d0n7Ecd48000055
export COMPUTE_SERVER_ID=0

# optional for more logging

export DEBUG=cocalc:\*
export DEBUG_CONSOLE=yes
```

If API_KEY is a project-wide API key, then you can change COCALC_PROJECT_ID however you want
and don't have to worry about whether the project is running or the project secret key changing
when the project is restarted.

2. Then do this:

```sh
$ . project-env.sh
$ node
```

Now anything involving conat will work with identity the project.
