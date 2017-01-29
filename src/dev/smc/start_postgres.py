#!/usr/bin/env python

"""
This is a script for starting PostgreSQL for SMC main site deployment, at
least until we change the database to use Kubernetes.
"""

import os, sys, time

path = os.path.split(os.path.realpath(__file__))[0]; os.chdir(path); sys.path.insert(0, path)

PG_DATA = os.path.join(path, "postgres_data")

def cmd(s):
    print(s)
    if os.system(s):
        raise RuntimeError

def stop_server():
    try:
        cmd("kill %s"%(open(os.path.join(PG_DATA, 'postmaster.pid')).read().split()[0]))
        time.sleep(3)
    except Exception, err:
        print "WARNING", err


if __name__ == '__main__':
    if not os.path.exists(PG_DATA):
        # Create the database directory file structure
        cmd("pg_ctl init -D '%s'"%PG_DATA)

        # Set database to only use local sockets for communication (with no password)
        open(os.path.join(PG_DATA,'pg_hba.conf'), 'w').write('local all all trust\n')
        cmd("chmod og-rwx '%s'"%PG_DATA)  # just in case -- be paranoid...

        # Start database running in background as daemon
        cmd("postgres -D '%s' >%s/postgres.log 2>&1 &"%(PG_DATA, PG_DATA))
        time.sleep(5)

        # Create the smc user (with no password -- you better do that!!)
        cmd("createuser -sE smc")

        # Stop database daemon
        stop_server()

        # Set database so only way to connect is as 'smc' user via encrypted password.
        # (TODO: Note -- connection (so data) isn't necessarily encrypted unless we build
        # postgreSQL properly -- see https://www.postgresql.org/docs/9.6/static/auth-pg-hba-conf.html)
        open(os.path.join(PG_DATA,'pg_hba.conf'), 'w').write('host all smc all md5\n')

    # Start database daemon listening on all network interfaces.
    cmd("postgres -h 0.0.0.0 -D '%s' >%s/postgres.log 2>&1 &"%(PG_DATA, PG_DATA))

