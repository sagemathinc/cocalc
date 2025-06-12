# The hub CoCalc web server

This code is part of https://github.com/sagemathinc/cocalc and isn't currently designed to be used standalone. Our plan is to refactor this code into smaller useful modules that are published under the @cocalc npm organization.

This is a node.js process that serves _all_ of the following (possibly simultaneously):

- static content - our mirror of the cdn and the results of webpack (packages/static)
- a proxy server that connects client browsers to projects
- project control server that creates, starts and stops projects running locally

## Running the server

Run the dev server, suitable for use inside a CoCalc project:

```sh
npm run hub-project-dev
```

## Using a different BASE\_PATH and PORT

Just set either the BASE\_PATH or PORT environment variables when starting thehub, and it will use what you set. If you do not set a BASE\_PATH it uses either"/" by default, or something involving the project id if you're inside a CoCalcproject.

If you don't set the PORT then 5000 is used by default.   The only way to set the port is via the PORT environment variable.

You can use the `--hostname` command line options if you are starting the hub directly via the `cocalc-hub-server` script and need to specify a different interface (e.g., 0.0.0.0 instead of localhost).

## Listening on https

As a quick test, you can do

```sh
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ./selfsigned.key -out selfsigned.crt
```

to create self-signed key and cert. You can then start the hub with these two files as options:

```sh
cd packages/hub; npx cocalc-hub-server ... --https-key=./selfsigned.key --https-cert=./selfsigned.crt
```

and the hub will use https instead of http. Simple as that.

## Conat

To run each component of conat separately.  Do each of these in DIFFERENT terminals, with the env variables as possible examples in dev mode.

Run the conat\-core socketio server on port 5000:

```sh
~/cocalc/src/packages/hub$ PORT=5000 DEBUG=cocalc:* DEBUG_CONSOLE=yes pnpm cocalc-hub-server --conat-core
```

Run the conat\-api server on port 5002, but pointed out our port 5000 socketio server

```sh
CONAT_SERVER=http://localhost:5000/3fa218e5-7196-4020-8b30-e2127847cc4f/port/5002 DEBUG=cocalc:*proxy* DEBUG_CONSOLE=yes pnpm cocalc-hub-server --conat-api
```

Run one or more persist servers:

```
CONAT_SERVER=http://localhost:5000/3fa218e5-7196-4020-8b30-e2127847cc4f/port/5002 DEBUG=cocalc:* DEBUG_CONSOLE=yes pnpm cocalc-hub-server --conat-persist
```

