#!/usr/bin/env python

"""
This is a script for starting postgres for development purposes
in an SMC project.
"""

import os, sys, util

path = os.path.split(os.path.realpath(__file__))[0]; os.chdir(path); sys.path.insert(0, path)

PG_DATA = os.path.join(path, "postgres_data")

if not os.path.exists(PG_DATA):
    util.cmd("pg_ctl init -D '%s'"%PG_DATA)

    # Lock down authentication so it is ONLY via unix socket
    open(os.path.join(PG_DATA,'pg_hba.conf'), 'w').write(
"""
# This is safe since we only enable a socket protected by filesystem permissions:
local all all trust

# You can uncomment this and comment out the above if you want to test password auth.
#local all all md5
""")

    # Make it so the socket is n this subdirectory, so that it is
    # protected by UNIX permissions.  This approach avoids any need
    # for accounts/passwords for development and the Docker image.
    conf = os.path.join(PG_DATA, 'postgresql.conf')
    s = open(conf).read()
    s += '\n'

    # Move the default directory where the socket is from /tmp to right here.
    socket_dir = os.path.join(PG_DATA, 'socket')
    s += "unix_socket_directories = '%s'"%socket_dir
    os.makedirs(socket_dir)
    os.system("chmod og-rwx '%s'"%PG_DATA)  # just in case -- be paranoid...
    open(conf,'w').write(s)

    # Create script so that clients will know where socket dir is.
    open("postgres-env", 'w').write("""#!/bin/sh
export PGUSER='smc'
export PGHOST='%s'
"""%socket_dir)

    os.system('chmod +x postgres-env')

util.cmd("postgres -D '%s'"%PG_DATA)
