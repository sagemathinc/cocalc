# The hub CoCalc web server.

This code is part of https://github.com/sagemathinc/cocalc and isn't currently designed to be used standalone. Our plan is to refactor this code into smaller useful modules that are published under the @cocalc npm organization.

This is a node.js process that serves _all_ of the following (possibly simultaneously):

- static content - our mirror of the cdn and the results of webpack (packages/static)
- an http api as documented at https://doc.cocalc.com/api
- a websocket connection that client browsers use for sign in, account config, creating projects, etc.
- a proxy server that connects client browsers to projects
- project control server that creates, starts and stops projects running locally

## Running the server

Run the dev server, suitable for use inside a CoCalc project:

```sh
npm run dev
```

Run the hub server for use from cocalc-docker:

```sh
npm run docker
```

## Using a different BASE_PATH and PORT

Just set either the BASE_PATH or PORT environment variables when starting the
hub, and it will use what you set. If you do not set a BASE_PATH it uses either
"/" by default, or something involving the project id if you're inside a CoCalc
project. If you don't set the PORT then 5000 is used by default.

## Listening on https

As a quick test, you can do

```sh
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ./selfsigned.key -out selfsigned.crt
```

to create self-signed key and cert. You can then start the hub with these two files as options:

```sh
... cocalc-hub-server ... --https-key=./selfsigned.key --https-cert=./selfsigned.crt
```

and the hub will use https instead of http. Simple as that.
