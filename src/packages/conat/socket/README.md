# SOCKETS

In compute networking, **TCP sockets** are a great idea that's been around since 1974! They are
incredibly useful as an abstraction. To create
a TCP socket you define source and target ports and ip address, and have a client
and server that are on a common network, so the client can connect to
the server. On the other hand, conat's pub/sub model lets you
instead have all clients/servers connect to a common "fabric"
and publish and subscribe using subject patterns and subjects.
This is extremley nice because there's no notion of ip addresses,
and clients and servers do not have to be directly connected to
each other.

**The TCP protocol for sockets guarantees **in-order, reliable, and
lossless transmission of messages between sender and receiver.\*\*
That same guarantee is thus what we support with our socket abstraction.

This module provides an emulation of sockets but on top of the
conat pub/sub model. The server and clients agree on a common
_subject_ pattern of the form `${subject}.>` that they both
have read/write permissions for. Then the server listens for
new socket connections from clients. Sockets get setup and
the server can write to each one, they can write to the server,
and the server can broadcast to all connected sockets.
There are heartbeats to keep everything alive. When a client
or server properly closes a connection, the other side gets
immediately notified.

Of course you can also send arbitrary messages over the socket.

STATES:

- disconnected \- not actively sending or receiving messages. You can write to the socket and messages will be buffered to be sent when connected.
- connecting \- in the process of connecting
- ready \- actively connected and listening for incoming messages
- closed: _nothing_ further can be done with the socket.

A socket can be closed by the remote side.

LOAD BALANCING AND AUTOMATIC FAILOVER:

You can have several distinct socket servers for the same subject pattern,
and connection will get distributed between them, but once a connection
is created, it will persist in the expected way (i.e., the socket
connects with exactly one choice of server). If a client tries
to connect again with the same subject they may get a different server.
However, you can set the loadBalancer option on the client
to control this better (this is what the persist functionality does).

HEADERS ARE FULLY SUPPORTED:

If you just use s.write(data) and s.on('data', (data)=>) then
you get the raw data without headers. However, headers -- arbitrary
JSON separate from the raw (possibly binary) payload -- are supported.
You just have to pass a second argument:
s.write(data, headers) and s.on('data', (data,headers) => ...)

UNIT TESTS:

For unit tests, see

backend/conat/test/socket/conat-socket.test.ts

WARNING:

If you create a socket server on with a given subject, then
it will use `${subject}.server.*` and `${subject}.client.*`, so
don't use `${subject}.>` for anything else!

DEVELOPMENT:

Start node via

```
CONAT_SERVER=http://localhost:3000 node

// conat socketio server

s = await require('@cocalc/server/conat/socketio').initConatServer({port:3000}); 0

// server side of socket

conat = await require('@cocalc/backend/conat').conat(); s = conat.socket.listen('conat.io');s.on('connection',(socket)=>{
    console.log("got new connection", socket.id);
    socket.on('data',(data) => console.log("got", {data}));
    socket.on('request', (mesg)=>{console.log("responding..."); mesg.respondSync('foo')})});0

// client side of socket

conat = await require('@cocalc/backend/conat').conat(); c = conat.socket.connect('conat.io');c.on('data',(data) => console.log("got", {data}));0

c.write('hi')
```
