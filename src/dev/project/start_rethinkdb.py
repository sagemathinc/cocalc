#!/usr/bin/env python
import os, sys, util

path = os.path.split(os.path.realpath(__file__))[0]; os.chdir(path); sys.path.insert(0, path)

util.chdir()

ports = util.get_ports()

if not os.path.exists('rethinkdb_data'):
    util.cmd('rethinkdb create -d "rethinkdb_data"')

util.cmd('rethinkdb serve --cluster-port {cluster_port} --driver-port {driver_port} --no-http-admin'.format(
        driver_port=ports['rethinkdb'], cluster_port=ports['rethinkdb_cluster']))
