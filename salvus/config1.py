#!/usr/bin/env python

import sys

from admin import (Account, Component, whoami,
                   HAproxy, Nginx, PostgreSQL, Memcached, Tornado, Sage, Stunnel)

# this is for local testing/development; for deployment sitename="codethyme.com"
#from misc import local_ip_address
#sitename = local_ip_address()
sitename = 'salv.us'

####################
# A configuration
####################

local_user = Account(username='wstein', hostname='localhost')
root_user = Account(username='root', hostname='localhost')

# Database configuration
log_database = "dbname=monitor"    # TODO: will need to have network info, password, etc...

postgresql = Component('postgreSQL', [PostgreSQL(local_user, 0, log_database=log_database)])
try:
    postgresql[0].createdb('monitor')
except IOError:
    postgresql[0].initdb()
    postgresql[0].createdb('monitor')
    
# static web server
nginx      = Component('nginx', [Nginx(local_user, 0, port=8080, log_database=log_database)])

stunnel    = Component('stunnel', [Stunnel(root_user, 0, accept_port=443, connect_port=8000, log_database=log_database)])

tornado    = Component('tornado', [Tornado(local_user, i, 5000+i, log_database=log_database) for i in range(3)])

haproxy    = Component('haproxy', [HAproxy(root_user, 0, sitename=sitename, insecure_redirect_port=80,
                                           accept_proxy_port=8000,  # same as connect_port of stunnel 
                                           log_database=log_database,
                                           insecure_testing_port=8001,
                                           nginx_servers=[{'ip':'127.0.0.1', 'port':8080, 'maxconn':10000}],
                                           tornado_servers=[{'ip':'127.0.0.1', 'port':(5000+n), 'maxconn':10000} for n in [0,1,2]]
                                           )])

memcached  = Component('memcached', [Memcached(local_user, 0, log_database=log_database,
                                               m=512,   # max memory to use for items in megabytes
                                               c=8192,  # max simultaneous connections
                                               )])

sage     = Component('sage', [Sage(local_user, 0, 6000, log_database=log_database)])

all = {'postgresql':postgresql, 'nginx':nginx, 'haproxy':haproxy,
       'memcached':memcached, 'tornado':tornado, 'sage':sage,
       'stunnel':stunnel}

ALL = ','.join(all.keys())

def action(c, what):
    if c=='none': return
    print '%s %s:'%(what, c)
    c = c.strip()
    if not c: return
    if c not in all:
        print "no component '%s'"%c
        sys.exit(1)
    print ' '*10 + str(getattr(all[c], what)())
    print

if __name__ == "__main__":

    import argparse
    parser = argparse.ArgumentParser(description="Control the thyme setup, where everything runs locally on one server as the same user.   Use '--status=' with nothing after '=' to get status of all processes, and similarly for start, stop, restart.")

    parser.add_argument("--init", dest='init', default=False, action="store_const", const=True,
                        help="initialize for first usage")

    parser.add_argument("--start", dest='start', type=str, default='none',
                        help="start comma separated list of components (or 'all'='%s')"%(ALL.replace(',',', ')))

    parser.add_argument("--stop", dest='stop', type=str, default='none', help="stop given components")
    
    parser.add_argument("--status", dest='status', type=str, default='none', help="status of given components")

    parser.add_argument("--restart", dest='restart', type=str, default='none', help="restart given components")
    
    args = parser.parse_args()

    if args.init:
        for p in postgresql:
            p.initdb(port=5432)
            p.createdb('sagews')
        sys.exit(0)

    if args.start in ['all', '']:
        args.start = ALL
    if args.stop in ['all', '']:
        args.stop = ALL
    if args.status in ['all','']:
        args.status = ALL
    if args.restart in ['all', '']:
        args.restart = ALL
        
    for c in args.start.split(','):
        action(c, 'start')
    for c in args.stop.split(','):
        action(c, 'stop')
    for c in args.status.split(','):
        action(c, 'status')
    for c in args.restart.split(','):
        action(c, 'restart')
    
        
