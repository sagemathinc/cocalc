#!/usr/bin/env python3
import rethinkdb, sys

"""
Our health check for now is just that it is possible to connect
to the database on localhost at all.
"""

def is_healthy():
    try:
        rethinkdb.connect(host='localhost', timeout=2)
        return True
    except:
        return False

if __name__ == "__main__":
    if is_healthy():
        sys.exit(0)
    else:
        sys.exit(1)
