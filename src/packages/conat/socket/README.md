# SOCKETS

In compute networking, **TCP sockets** are a great idea that's been around since 1974!  They are
incredibly useful as an abstraction.  To create
a TCP socket you define source and target ports and ip address, and have a client
and server that are on a common network, so the client can connect to
the server.  On the other hand, conat's pub/sub model lets you
instead have all clients/servers connect to a common "fabric"
and publish and subscribe using subject patterns and subjects.
This is extremley nice because there's no notion of ip addresses,
and clients and servers do not have to be directly connected to
each other.

**The TCP protocol for sockets guarantees **in-order, reliable, and
lossless transmission of messages between sender and receiver.**
That same guarantee is thus what we support with our socket abstraction.

This module provides an emulation of sockets but on top of the
conat pub/sub model.  The server and clients agree on a common
*subject* pattern of the form `${subject}.>` that they both
have read/write permissions for.  Then the server listens for
new socket connections from clients.  Sockets get setup and
the server can write to each one, they can write to the server,
and the server can broadcast to all connected sockets.
There are heartbeats to keep everything alive. When a client
or server properly closes a connection, the other side gets
immediately notified.

Of course you can also send arbitrary messages over the socket.

LOAD BALANCING AND AUTOMATIC FAILOVER:

We use a *sticky* subscription on the server's side.  This means
you can have several distinct socket servers for the same subject,
and connection will get distributed between them, but once a connection
is created, it will persist in the expected way (i.e., the socket
connects with exactly one choice of server).  You can dynamically
add and remove servers at any time.  You get stateful automatic
load balancing and automatic across all of them.

HEADERS ARE FULLY SUPPORTED:

If you just use s.write(data) and s.on('data', (data)=>) then
you get the raw data without headers.  However, headers -- arbitrary
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

CONAT_SERVER=http://localhost:3000 node

// conat socketio server

s = await require('@cocalc/server/conat/socketio').initConatServer({port:3000}); 0

// server side of socket

conat = await require('@cocalc/backend/conat').conat(); s = conat.socket.listen('conat.io');s.on('connection',(socket)=>{
    console.log("got new connection", socket.id);
    socket.on('data',(data) => console.log("got", {data}));
    socket.on('request', (mesg)=>{console.log("responding..."); mesg.respondSync('foo')})
});0

// client side of socket

conat = await require('@cocalc/backend/conat').conat(); c = conat.socket.connect('conat.io');c.on('data',(data) => console.log("got", {data}));0

c.write('hi')

