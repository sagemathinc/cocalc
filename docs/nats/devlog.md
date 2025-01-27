# NATS Development and Integration Log

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
- OK, made some of api/v2 usable. Obviously this is really minimal POC.

## [x] GOAL: do something involving the project

The most interesting use case for nats/jetsteam is timetravel collab editing, where this is all a VERY natural fit.

But for now, let's just do _something_ at all.

This worked - I did project exec with subject projects.{project_id}.api

## [x] Goal: Queue group for hub api

- change this to be a queue group and test by starting a few servers at once

## [x] Goal: Auth Strategy that is meaningful

Creating a creds file that encodes a JWT that says what you can publish and subscribe to, then authenticating with that works.

- make it so user with account_id can publish to hub.api.{account_id} makes it so we know the account_id automatically by virtue of what was published to. This works.

## [x] Goal: Solve Critical Auth Problems

Now need to solve two problems:

- [x] GOAL: set the creds for a browser client in a secure http cookie, so the browser can't directly access it

I finally figured this out after WASTING a lot of time with stupid AI misleading me and trying actively to get me to write very stupid insecure code as a lazy workaround. AI really is very, very dangerous... The trick was to read the docs repeatedly, increase logging a lot, and \-\- most imporantly \-\- read the relevant Go source code of NATS itself. The answer is to modify the JWT so that it explicitly has bearer set: `nsc edit user wstein --bearer`

This makes it so the server doesn't check the signature of the JWT against the _user_ . Putting exactly the JWT token string in the cookie then works because "bearer" literally tells the backend server not to do the signature check. I think this is secure and the right approach because the server checks that the JWT is valid using the account and operator signatures.

**WAIT!** Using signing keys [https://docs.nats.io/using\-nats/nats\-tools/nsc/signing_keys](https://docs.nats.io/using-nats/nats-tools/nsc/signing_keys) \(and https://youtu.be/KmGtnFxHnVA?si=0uvLMBTJ5TUpem4O \) is VASTLY superior. There's just one JWT issued to each user, and we make a server\-side\-only JWT for their account that has everything. The user never has to reconnect or change their JWT. We can adjust the subject on the fly to account for running projects \(or collaboration changes\) at any time server side. Also the size limits go away, so we don't have to compress project_id's \(probably\).

## Goal: Implement Auth Solution for Browsers

- [x] automate creation of creds for browser clients, i.e., what we just did with the nsc tool manually
-

---

This is my top priority goal for NOW!

What's the plan?

Need to figure out how to do all the nsc stuff from javascript, storing results in the database?

- Question: how do we manage creating signing keys and users from nodejs? Answer: clear from many sources that we must use the nsc CLI tool via subprocess calls. Seems fine to me.
- [x] When a user signs in, we check for their JWT in the database. If it is there, set the cookie. If not, create the signing key and JWT for them, save in database, and set the cookie.
- [x] update nats\-server resolver state after modifying signing cookie's subjects configuration.

```
nsc edit operator --account-jwt-server-url nats://localhost:4222
```

Now I can do `nsc push` and it just works.

[x] TODO: when signing out, need to delete the jwt cookie or dangerous private info leaks... and also new info not set properly.

- [x] similar creds for projects, I.e., access to a project means you can publish to `projects.{project_id}.>` Also, projects should have access to something under hub.

## [x] Goal: Auth for Projects

Using an env variable I got a basic useful thing up and running.

---

Some thoughts about project auth security:

- [ ] when collaborators on a project leave maybe we change JWT? Otherwise, in theory any user of a project can probably somehow get access to the project's JWT \(it's in memory at least\) and still act as the project. Changing JWT requires reconnect. This could be "for later", since even now we don't have this level of security!
- [ ] restarting project could change JWT. That's like the current project's secret token being changed.

## [ ] Goal: nats-server automation of creation and configuration of system account, operator, etc.

- This looks helpful: https://www.synadia.com/newsletter/nats-weekly-27/
- NOT DONE YET

## [x] Goal: Terminal!  Something complicated involving the project which is NOT just request/response

- Implementing terminals goes beyond request/response.
- It could also leverage jetstream if we want for state (?).
- Multiple connected client

Project/compute server sends terminal output to 

    project.{project_id}.terminal.{sha1(path)}

Anyone who can read project gets to see this.

Browser sends terminal input to

    project.{project_id}.{group}.{account_id}.terminal.{sha1(path)}

API calls:

  - to start terminal
  - to get history (move to jetstream?)

If I can get this to work, then collaborative editing and everything else is basically the same (just more details).

## [x] Goal: Terminal!  #now 

Make it so an actual terminal works, i.e., UI integration.

## [x] Goal: Terminal JetStream state

Use Jetstream to store messages from terminal, so user can reconnect without loss. !?  This is very interesting...

First problem -- we used the system account SYS for all our users; however, 
SYS can't use jetstreams, as explained here https://github.com/nats-io/nats-server/discussions/6033

Let's redo *everything* with a new account called "cocalc".

```sh
~/nats$ nsc create account --name=cocalc
[ OK ] generated and stored account key "AD4G6R62BDDQUSCJVLZNA7ES7R3A6DWXLYUWGZV74EJ2S6VBC7DQVM3I"
[ OK ] added account "cocalc"
~/nats$ nats context save admin --creds=/projects/3fa218e5-7196-4020-8b30-e2127847cc4f/.local/share/nats/nsc/keys/creds/MyOperator/cocalc/admin.creds
~/nats$ nsc edit account cocalc  --js-enable 1
~/nats$ nsc push -a cocalc
```

```js
// making the stream for ALL terminal activity
await jsm.streams.add({ name: 'project-81e0c408-ac65-4114-bad5-5f4b6539bd0e-terminal', subjects: ['project.81e0c408-ac65-4114-bad5-5f4b6539bd0e.terminal.>'] });

// making a consumer for just one subject (e.g., one terminal frame)
z = await jsm.consumers.add('project-81e0c408-ac65-4114-bad5-5f4b6539bd0e-terminal',{name:'9149af7632942a94ea13877188153bd8bf2ace57',filter:['project.81e0c408-ac65-4114-bad5-5f4b6539bd0e.terminal.9149af7632942a94ea13877188153bd8bf2ace57']})
c = await js.consumers.get('project-81e0c408-ac65-4114-bad5-5f4b6539bd0e-terminal', '9149af7632942a94ea13877188153bd8bf2ace57')
for await (const m of await c.consume()) { console.log(cc.client.nats_client.jc.decode(m.data))}
```

NOTE!!! The above consumer is ephemeral -- it disappears if we don't grab it via c within a few seconds!!!!  https://docs.nats.io/using-nats/developer/develop_jetstream/consumers

## [ ] Goal: Jetstream permissions

- [x] project should set up the stream for capturing terminal outputs.
- [x] delete old messages with a given subject. `nats stream purge project-81e0c408-ac65-4114-bad5-5f4b6539bd0e-terminal --seq=7000` 
  - there is  a setting max\_msgs\_per\_subject on a stream, so **we just set that and are done!**  Gees.  It is too easy.
- [x] handle the other messages like resize
- [x] need to move those other messages to a different subject that isn't part of the stream!!
- [ ] permissions for jetstream usage and access
- [ ] use non\-json for the data....
- [ ] refactor code so basic parameters \(e.g., subject names, etc.\) are defined in one place that can be imported in both the frontend and backend.
- [ ] font size keyboard shortcut
- [ ] need a better algorithm for sizing since we don't know when a user disconnects!
  - when one user proposes a size, all other clients get asked their current size and only those that respond matter.  how to do this?

## [ ] Goal: Basic Collab Document Editing

Plan.  

- [x] Use a kv store hosted on nats to trac syncstring objects as before.  This means anybody can participate \(browser, compute server, project\) without any need to contact the database, hence eliminating all proxying!

[x] Next Goal \- collaborative file editing \-\- some sort of "proof of concept"!  This requires implementing the "ordered patches list" but on jetstream.  Similar to the nats SyncTable I wrote yesterday, except will use jetstream directly, since it is an event stream, after all.

- [x] synctable\-stream: change to one big stream for the whole project but **consume** a specific subject in that stream?

[ ] cursors \- an ephemeral table

---

- [ ] Subject For Particular File: `project.${project_id}.patches.${sha1(path)}` 
- [ ] Stream: Records everything with this subject  `project.${project_id}.patches`
- [ ] It would be very nice if we can use the server assigned timestamps.... but probably not
  - [ ] For transitioning and de\-archiving, there must be a way to do this, since they have a backup/restore process

## [ ] Goal: PostgreSQL Changefeed Synctable

This is critical to solve.  This sucks now.   This is key to eliminating "hub\-websocket".  This might be very easy.  Here's the plan:

- [x] make a request/response listener that listens on hub.account.{account\_id} and hub.db.project.{project\_id} for a db query.
- [x] if changes is false, just responds with the result of the query.
- [ ] if changes is true, get kv store k named  `account-{account_id}` or `project-{project_id}` \(which can be used by project or compute server\).
  - let id be the sha1 hash of the query \(and options\)
  - k.id.update is less than X seconds ago, do nothing... it's already being updated by another server.
  - do the query to the database \(with changes true\)
  - write the results into k under k.id.data.key = value.
  - keep watching for changes so long as k.id.interest is at most n\*X seconds ago.
  - Also set k.id.update to now.
  - return id
- [ ] another message to `hub.db.{account_id}` which contains a list of id's.
  - When get this one, update k.id.interest to now for each of the id's.

With the above algorithm, it should be very easy to reimplement the client side of SyncTable.  Moreover, there are many advantages:

- For a fixed account\_id or project\-id, there's no extra work at all for 1 versus 100 of them.  I.e., this is great for opening a bunch of distinct browser windows.
- If you refresh your browser, everything stays stable \-\- nothing changes at all and you instantly have your data.  Same if the network drops and resumes.
- When implementing our new synctable, we can immediately start with the possibly stale data from the last time it was active, then update it to the correct data.  Thus even if everything but NATS is done/unavailable, the experience would be much better.   It's like "local first", but somehow "network mesh first".  With a leaf node it would literally be local first.

---

This is working well!  

TODO:

- [x] build full proof of concept SyncTable on top of my current implementation of synctablekvatomic, to _make sure it is sufficient_
  - this worked and wasn't too difficult

THEN do the following to make it robust and scalable

- [ ] store in nats which servers are actively managing which synctables
- [ ] store in nats the client interest data, instead of storing it in memory in a server?  i.e., instead of client making an api call, they could instead just update a kv and say "i am interested in this changefeed".   This approach would make everything just keep working easily even as servers scale up/down/restart.

---

## [ ] Goal: Terminal and **compute server**

Another thing to do for compute servers:

- use jetstream and KV to agree on _who_ is running the terminal?

This is critical to see how easily we can support compute servers using nats + jetstream.

