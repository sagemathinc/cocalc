The Node.js daemons that run in a CoCalc project. It includes code related to realtime sync, a Jupyter kernel server, parts of a Sage worksheet server, and much more.

This code is part of https://github.com/sagemathinc/cocalc and isn't currently designed to be used standalone. Our plan is to refactor this code into smaller useful modules that are published under the @cocalc npm organization.

## Environment variables

- `DATA` -- directory where local data about the running project server is stored. The default is `~/.cocalc`.

- `HUB_PORT` -- the project starts a TCP server listening on this port for connections _from_ the hub. Connections are denied unless they start with a secret token that is shared between the project and the hub. On cocalc-docker, the hub loads this from the filesystem. On Kubernetes, it shares it via a Kubernetes secret. If this variable is not set, then the operating system assigns the hub port at random, and you can find it in $DATA.

- `CLIENT_PORT` -- the project also starts an HTTP server (that supports websockets) on this port for connections from web browser *clients*. The hub only proxies connections to the project if the user is allowed to make them, which is how this is secured in Kubernetes. In cocalc-docker, the hub inserts an extra cookie in the http request... TODO.

- `COCALC_PROJECT_ID`

- `COCALC_USERNAME`