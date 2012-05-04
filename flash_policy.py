#!/usr/bin/env python

# Flash access policy server based on gevent
# Jan-Philip Gehrcke, June 2011

# Listen on port 843; send acess policy to client; disconnect.

# From -- http://gehrcke.de/2011/06/flash-socket-policy-server-in-python-based-on-gevent/

from gevent.server import StreamServer
import datetime
import socket

# Should we log something? Where to?
LOG = 1
LOGFILE = "flash_access_policy_server.log"

# The policy that is sent to the clients.
POLICY = """<cross-domain-policy><allow-access-from domain="*" to-ports="*" /></cross-domain-policy>\0"""

# The string the client has to send in order to receive the policy.
POLICYREQUEST = "<policy-file-request/>"

# This function is called for each incoming connection
# (in a non-blocking fashion in a greenlet)
def client_handle(sock, address):
    log("%s:%s: Connection accepted." % address)
    # send and read functions should not wait longer than three seconds
    sock.settimeout(3)
    try:
        # try to receive at most 128 bytes (`POLICYREQUEST` is shorter)
        input = sock.recv(128)
        if input.startswith(POLICYREQUEST):
            sock.sendall(POLICY)
            log("%s:%s: Policy sent. Closing connection." % address)
        else:
            log("%s:%s: Crap received. Closing connection." % address)
    except socket.timeout:
        log("%s:%s: Timed out. Closing." % address)
    sock.close()

# Write `msg` to file and stdout, prepended by a date/time string
def log(msg):
    if LOG:
        l = "%s: %s" % (datetime.datetime.now().isoformat(), msg)
        lf.write("%s\n" % l)
        print l

if __name__ == '__main__':
    if LOG:
        lf = open(LOGFILE, "a")
    server = StreamServer(('0.0.0.0', 843), client_handle)
    log('Starting server...')
    server.serve_forever()
