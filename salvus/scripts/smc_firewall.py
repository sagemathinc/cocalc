#!/usr/bin/env python

###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, 2015, William Stein
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

import hashlib, json, os, re, shutil, signal, stat, sys, tempfile, time
from subprocess import Popen, PIPE

def log(s, *args):
    if args:
        try:
            s = str(s%args)
        except Exception, mesg:
            s = str(mesg) + str(s)
    sys.stderr.write(s+'\n')
    sys.stderr.flush()

def cmd(s, ignore_errors=False, verbose=2, timeout=None, stdout=True, stderr=True):
    if isinstance(s, list):
        s = [str(x) for x in s]
    if verbose >= 1:
        if isinstance(s, list):
            t = [x if len(x.split()) <=1  else "'%s'"%x for x in s]
            log(' '.join(t))
        else:
            log(s)
    t = time.time()

    mesg = "ERROR"
    if timeout:
        mesg = "TIMEOUT: running '%s' took more than %s seconds, so killed"%(s, timeout)
        def handle(*a):
            if ignore_errors:
                return mesg
            else:
                raise KeyboardInterrupt(mesg)
        signal.signal(signal.SIGALRM, handle)
        signal.alarm(timeout)
    try:
        out = Popen(s, stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=not isinstance(s, list))
        x = out.stdout.read() + out.stderr.read()
        e = out.wait()  # this must be *after* the out.stdout.read(), etc. above or will hang when output large!
        if e:
            if ignore_errors:
                return (x + "ERROR").strip()
            else:
                raise RuntimeError(x)
        if verbose>=2:
            log("(%s seconds): %s", time.time()-t, x[:500])
        elif verbose >= 1:
            log("(%s seconds)", time.time()-t)
        return x.strip()
    except IOError:
        return mesg
    finally:
        if timeout:
            signal.signal(signal.SIGALRM, signal.SIG_IGN)  # cancel the alarm


class Firewall(object):
    def iptables(self, args, **kwds):
        return cmd(['iptables','-v'] + args, **kwds)

    def insert_rule(self, rule):
        if not self.exists(rule):
            log("insert_rule: %s", rule)
            self.iptables(['-I'] + rule)

    def append_rule(self, rule):
        if not self.exists(rule):
            log("append_rule: %s", rule)
            self.iptables(['-A'] + rule)

    def delete_rule(self, rule):
        if not self.exists(rule):
            log("delete_rule: %s", rule)
            self.iptables(['-D'] + rule)

    def exists(self, rule):
        """
        Return true if the given rule exists already.
        """
        try:
            self.iptables(['-C'] + rule, verbose=0)
            #log("rule %s already exists", rule)
            return True
        except:
            #log("rule %s does not exist", rule)
            return False

    def clear(self):
        """
        Remove all firewall rules, making everything completely open.
        """
        self.iptables(['-F'])

    def show(self, names=False):
        """
        Show all firewall rules, making everything completely open.
        """
        if names:
            os.system("iptables -v -L")
        else:
            os.system("iptables -v -n -L")

    def outgoing(self, whitelist_hosts='', whitelist_users='', blacklist_users=''):
        """
        Block all outgoing traffic, except what is given
        in a specific whitelist and DNS.
        """
        if whitelist_hosts:
            self.outgoing_whitelist_hosts(whitelist_hosts)
        if whitelist_users or blacklist_users:
            self.outgoing_user(whitelist_users, blacklist_users)

    def outgoing_whitelist_hosts(self, whitelist):
        whitelist = [x.strip() for x in whitelist.split()]
        # determine the ip addresses of our locally configured DNS servers
        for x in open("/etc/resolv.conf").readlines():
            v = x.split()
            if v[0] == 'nameserver':
                log("adding nameserver %s to whitelist", v[1])
                whitelist.append(v[1])
        whitelist = ','.join(whitelist)
        log("whitelist: %s", whitelist)

        # Insert whitelist rule at the beginning of OUTPUT chain.
        # Anything that matches this will immediately be accepted to go out.
        self.insert_rule(['OUTPUT', '-d', whitelist, '-j', 'ACCEPT'])

        # Block all new outgoing connections that we didn't allow above.
        self.append_rule(['OUTPUT', '-m', 'state', '--state', 'NEW', '-j', 'REJECT'])

    def outgoing_user(self, add='', remove=''):
        def rule(user):
            # returns rule for allowing this user and whether rule is already in chain
            return ['OUTPUT', '-m', 'owner', '--uid-owner', user , '-j', 'ACCEPT']
        for user in remove.split(','):
            if user:
                self.delete_rule(rule(user))
        for user in add.split(','):
            if user:
                self.insert_rule(rule(user))

    def incoming(self, whitelist_hosts=''):
        """
        Allow any incoming ssh (port 22 tcp) connections.
        Deny all other incoming traffic, except from the
        explicitly given whitelist of machines.
        """
        # allow incoming ssh
        self.insert_rule(['INPUT', '-p', 'tcp', '--dport', 22, '-j', 'ACCEPT'])
        # allow incoming anything in the whitelist
        self.insert_rule(['INPUT', '-s', whitelist_hosts, '-m', 'state', '--state', 'NEW,ESTABLISHED', '-j', 'ACCEPT'])
        # loopback traffic: allow only ports
        self.insert_rule(['INPUT', '-i', 'lo', '-j', 'ACCEPT'])
        #self.insert_rule(['OUTPUT', '-o', 'lo', '-j', 'ACCEPT'])
        # block everything else
        self.append_rule(['INPUT', '-j', 'DROP'])

if __name__ == "__main__":

    import argparse
    parser = argparse.ArgumentParser(description="SageMathCloud firewall control script")
    subparsers = parser.add_subparsers(help='sub-command help')

    def f(subparser):
        function = subparser.prog.split()[-1]
        def g(args):
            special = [k for k in args.__dict__.keys() if k not in ['func']]
            out = []
            errors = False
            kwds = dict([(k,getattr(args, k)) for k in special])
            try:
                result = getattr(Firewall(), function)(**kwds)
            except Exception, mesg:
                raise #-- for debugging
                errors = True
                result = {'error':str(mesg), 'project_id':project_id}
            print json.dumps(result)
            if errors:
                sys.exit(1)
        subparser.set_defaults(func=g)

    parser_outgoing = subparsers.add_parser('outgoing', help='create firewall to block all outgoing traffic, except explicit whitelist)')
    parser_outgoing.add_argument('--whitelist_hosts',help="comma separated list of sites to whitelist (if empty doesn't block anything)", default='')
    parser_outgoing.add_argument('--whitelist_users',help="comma separated list of users to whitelist", default='')
    parser_outgoing.add_argument('--blacklist_users',help="comma separated list of users to remove from whitelist", default='')
    f(parser_outgoing)

    parser_incoming = subparsers.add_parser('incoming', help='create firewall to block all incoming traffic except ssh, except explicit whitelist')
    parser_incoming.add_argument('--whitelist_hosts',help="comma separated list of sites to whitelist (should be the hub vm's)", default='')
    f(parser_incoming)

    f(subparsers.add_parser('clear', help='clear all rules'))

    parser_show = subparsers.add_parser('show', help='show all rules')
    parser_show.add_argument('--names',help="show hostnames (potentially expensive DNS lookup)", default=False, action="store_const", const=True)
    f(parser_show)

    args = parser.parse_args()
    args.func(args)



