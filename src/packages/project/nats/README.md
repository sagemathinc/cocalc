See ./api/index.ts for how to setup a shell environment so you can
connect to nats as a specific project for development purposes. Basically
something like this:

```sh
export COCALC_PROJECT_ID="00847397-d6a8-4cb0-96a8-6ef64ac3e6cf"
export COCALC_USERNAME="00847397d6a84cb096a86ef64ac3e6cf"
export HOME="/projects/6b851643-360e-435e-b87e-f9a6ab64a8b1/cocalc/src/data/projects/00847397-d6a8-4cb0-96a8-6ef64ac3e6cf"
export DATA=$HOME/.smc
```
