# TCP Sockets

## Messaging protocol

We send a message by first sending the length, then the bytes of the actual
message. The code in this section is used to communicate with sage_server and
console_server.

Extend the socket object so that listens to all data coming in on this socket
and fires a `'mesg'` event, along with the JSON object or blob in the message
So, one listens with:

```js
socket.on('mesg', (type, value) -> ...)
```

where type is one of `"json"` or `"blob"`.

Calling this function also adds a function `.write_mesg` to the socket, so that

```js
socket.write_mesg(type, data);
```

will send the message of the given type on the socket. When type=`"json'`,
data is just a JSON-able object. When type=`'blob'`, `data={uuid:..., blob:...};`
since every blob is tagged with a uuid.

**NOTE:** As of June 2022, I don't think the `"blob"` message type is used at all anymore.  I think in all cases where we did or would have used that, we instead transfer the same data over HTTP via the project's express http server.  That's asynchronous, cached, and much better for handling blobs than blocking our websocket would be.
