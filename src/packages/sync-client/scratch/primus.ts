/*
Create a very, very simple example using the nodejs ws library of a client
and server talking to each other via a websocket.  The client and server
should both be nodejs processes (no web browser involved!).

The simple code below works fine and accomplishes the goal above.

In one node shell:

> require('./dist/primus').server();
Server Received message: hi

In another:

> socket = require('./dist/primus').client();
> Client Received message: Welcome to the WebSocket server!
> socket.write("hi")
undefined
*/

import Primus from "primus";
import http from "http";
import { join } from "path";
import * as responder from "@cocalc/primus-responder";
import * as multiplex from "@cocalc/primus-multiplex";

export function server() {
  const httpServer = http.createServer((_req, res) => {
    res.end("Hello from the server!");
  });

  const primus = new Primus(httpServer, { transformer: "websockets" });

  primus.on("connection", (socket) => {
    console.log("Client connected");
    socket.write("Welcome to the server!");

    socket.on("data", (data) => {
      console.log(`Received from client: ${data}`);
    });
  });

  httpServer.listen(8080, () => {
    console.log("Server listening on port 8080");
  });
}

export function client() {
  const primus = Primus.createSocket({ transformer: "websockets" });
  const socket = new primus("http://localhost:8080");

  socket.on("open", () => {
    console.log("Connected to server");
    socket.write("Hello from the client!");

    socket.on("data", (data) => {
      console.log(`Received from server: ${data}`);
    });
  });

  return socket;
}

/*
connect to a specific project (bypassing the proxy) for now, so
we can flesh this out.

> c = require('./dist/primus').project({appBasePath:'/10f0e544-313c-4efe-8718-2142ac97ad11/port/5000',project_id:'97ce5a7c-25c1-4059-8670-c7de96a0db92', port:34491})
> c.writeAndWait({cmd:'exec',opts:{command:'pwd'}}, console.log)
undefined
> {
  stdout: '/home/user/cocalc/src/data/projects/97ce5a7c-25c1-4059-8670-c7de96a0db92\n',
  stderr: '',
  exit_code: 0
}

With this, we can make a proof of concept of a remote Jupyter
kernel.  Then we have to worry about authentication.
*/

export function project({
  appBasePath,
  project_id,
  port,
}: {
  appBasePath: string;
  project_id: string;
  port: number;
}) {
  const url = `http://127.0.0.1:${port}`;
  const opts = {
    pathname: join(appBasePath, project_id, "raw/.smc/ws"),
    transformer: "websockets",
    plugin: { responder, multiplex },
  } as const;
  const primus = Primus.createSocket(opts);
  const socket = new primus(url);

  socket.on("open", () => {
    console.log("Connected to project");
    socket.on("data", (data) => {
      console.log(`Received from server: ${data}`);
    });
  });

  return socket;
}
