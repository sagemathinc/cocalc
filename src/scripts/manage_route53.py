#!/usr/bin/python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################



DEFAULT_DOMAIN = "smc.sagedev.org"
DEFAULT_TTL = "300"
DEFAULT_HOSTS_FILE  = "/home/salvus/salvus/salvus/conf/deploy_cloud/hosts"

from admin import parse_hosts_file
import argparse

def load_hosts(hosts_file=DEFAULT_HOSTS_FILE):
	hosts = dict()

	for (name, addresses) in parse_hosts_file(hosts_file)[0].iteritems():
		if len(addresses) == 1:
			hosts[name] = addresses[0]

	return hosts


def update_hosts(args):

	try:
		import boto
	except ImportError:
		print "Error: Could not import boto module. Try \'sudo apt-get install python-boto\'."
		exit()	

	try:
		conn = boto.connect_route53()
	except boto.exception.NoAuthHandlerFound:
		print "\n\nNo AWS authentication credientials found."
		print "Credentials shoud be stored in the file ~/.boto"
		exit()

	zone = conn.get_zone(args.domain)

	if zone is None:
		print "Error: Could not execute the Route53 action get_zone for zone %s." % (domain)
		exit()

	hosts = load_hosts(args.hosts_file)

	for (hostname, address) in hosts.iteritems():

		if hostname == 'localhost':
			continue

		fqdn = hostname + '.' + args.domain

		if zone.find_records(fqdn, 'A'):
			print "%s exists, updating address to %s" % (fqdn, address)
			zone.update_a(fqdn, address, args.ttl)
		else:
			print "%s not found, creating new record with address %s" % (fqdn, address)
			zone.add_a(fqdn, address, args.ttl)


if __name__ == '__main__':

	parser = argparse.ArgumentParser(
    	description="Manage Amazon Route 53 DNS service.")
	subparsers = parser.add_subparsers()
	
	parser_update_hosts = subparsers.add_parser('update-hosts',
		help="Update DNS records from Salvus deployment hosts file.")
	parser_update_hosts.set_defaults(func=update_hosts)
	parser_update_hosts.add_argument('--hosts-file', default=DEFAULT_HOSTS_FILE)
	parser_update_hosts.add_argument('--domain', default=DEFAULT_DOMAIN)
	parser_update_hosts.add_argument('--ttl', default=DEFAULT_TTL)

	args = parser.parse_args()
	args.func(args)
