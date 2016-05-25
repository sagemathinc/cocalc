#!/usr/bin/env python3
import rethinkdb, sys

"""
Our health check for now is just that it is possible to connect
to the database on localhost at all.
"""

def is_healthy():
    try:
        auth_key = open('/secrets/rethinkdb/rethinkdb').read().strip()
        if not auth_key:
            auth_key = None
        rethinkdb.connect(host='localhost', timeout=2, auth_key=auth_key)
        return True
    except:
        return False

if __name__ == "__main__":
    if is_healthy():
        sys.exit(0)
    else:
        sys.exit(1)
