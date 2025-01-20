# Systematically keep track of NATS experiment here!

## [x] Goal: nats from nodejs

- start a nats server in cocalc\-docker
- connect from nats cli outside docker
- connect to it from the nodejs client over a websocket

```sh
nats-server -p 5004

nats context save --select --server nats://localhost:5004 nats

nats sub '>'
```

Millions of messages a second works \-\- and you can run like 5x of these at once without saturating nats\-server.

```js
import { connect, StringCodec } from "nats";
const nc = await connect({ port: 5004 });
console.log(`connected to ${nc.getServer()}`);
const sc = StringCodec();

const t0 = Date.now();
for (let i = 0; i < 1000000; i++) {
  nc.publish("hello", sc.encode("world"));
}
await nc.drain();
console.log(Date.now() - t0);
```

That was connecting over TCP. Now can we connect via websocket?

## [x] Goal: Websocket from browser

First need to start a nats **websocket** server instead on port 5004:

[https://nats.io/blog/getting\-started\-nats\-ws/](https://nats.io/blog/getting-started-nats-ws/)

```sh
nats context save --select --server ws://localhost:5004 ws
~/nats/nats.js/lib$ nats context select ws
NATS Configuration Context "ws"

  Server URLs: ws://localhost:5004
         Path: /projects/3fa218e5-7196-4020-8b30-e2127847cc4f/.config/nats/context/ws.json

~/nats/nats.js/lib$ nats pub foo bar
21:24:53 Published 3 bytes to "foo"
~/nats/nats.js/lib$
```

##

- their no\-framework html example DOES work for me!
- [https://localhost:4043/projects/3fa218e5\-7196\-4020\-8b30\-e2127847cc4f/files/nats/nats.js/lib/ws.html](https://localhost:4043/projects/3fa218e5-7196-4020-8b30-e2127847cc4f/files/nats/nats.js/lib/ws.html)
- It takes about 1\-2 seconds to send **one million messages** from browser outside docker to what is running inside there!

## [x] Goal: actually do something useful

- nats server
- browser connects via websocket port 5004
- nodejs hub connects via tcp
- hub answers a ping or something else from the browser...

This worked perfectly with no difficulty. It's very fast and flexible and robust.

Reconnects work, etc.

## [x] Goal: proxying

- nats server with websocket listening on localhost:5004
- proxy it via node\-proxy in the hub to localhost:4043/nats
- as above

This totally worked!

Everything is working that I try?!

Maybe NATS totally kicks ass.

## [x] Goal: do something actually useful.

- authentication: is there a way to too who the user who made the websocket connection is?
  - worry about this **later** \- obviously possible and not needed for a POC
- let's try to make `write_text_file_to_project` also be possible via nats.
- OK, made some of api/v2 usable.  Obviously this is really minimal POC.

## [x] GOAL: do something involving the project

The most interesting use case for nats/jetsteam is timetravel collab editing, where this is all a VERY natural fit.  

But for now, let's just do *something* at all.

This worked - I did project exec with subject projects.{project_id}.api

## [x] Goal: Queue group for hub api

- change this to be a queue group and test by starting a few servers at once

## [x] Goal: Auth Strategy that is meaningful

Creating a creds file that encodes a JWT that says what you can publish and subscribe to, then authenticating with that works.

- make it so user with account\_id can publish to hub.api.{account\_id} makes it so we know the account\_id automatically by virtue of what was published to.  This works.

## [ ] Goal: Solve Critical Auth Problems

Now need to solve two problems:

- [x] GOAL: set the creds for a browser client in a secure http cookie, so the browser can't directly access it

I finally figured this out after WASTING a lot of time with stupid AI misleading me and trying actively to get me to write very stupid insecure code as a lazy workaround.   AI really is very, very dangerous...  The trick was to read the docs repeatedly, increase logging a lot, and \-\- most imporantly \-\- read the relevant Go source code of NATS itself.  The answer is to modify the JWT so that it explicitly has bearer set:  `nsc edit user wstein --bearer` 

This makes it so the server doesn't check the signature of the JWT against the _user_ .    Putting exactly the JWT token string in the cookie then works because "bearer" literally tells the backend server not to do the signature check.  I think this is secure and the right approach because the server checks that the JWT is valid using the account and operator signatures.

- [ ] GOAL: automate creation of creds for browser clients, i.e., what we just did with the nsc tool.

If we can do the above, we should also be able to do something similar for:

- [ ] GOAL: connecting to projects.  I.e., access to a project means you can publish to `projects.{project_id}.>`   Also, projects should have access to something under hub.

