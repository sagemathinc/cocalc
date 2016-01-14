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

import json, os, signal, socket, sys, time
from subprocess import Popen, PIPE

def log(s, *args):
    if args:
        try:
            s = str(s%args)
        except Exception, mesg:
            s = str(mesg) + str(s)
    sys.stderr.write(s+'\n')
    sys.stderr.flush()

def cmd(s, ignore_errors=False, verbose=2, timeout=None, stdout=True, stderr=True, system=False):
    if isinstance(s, list):
        s = [str(x) for x in s]
    if isinstance(s, list):
        c = ' '.join([x if len(x.split()) <=1  else "'%s'"%x for x in s])
    else:
        c = s
    if verbose >= 1:
        if isinstance(s, list):
            log(c)
        else:
            log(s)
    t = time.time()

    if system:
        if os.system(c):
            if verbose >= 1:
                log("(%s seconds)", time.time()-t)
            if ignore_errors:
                return
            else:
                raise RuntimeError('error executing %s'%c)
        return

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
        try:
            return cmd(['iptables','-v'] + args, **kwds)
        except Exception, err:
            log("WARNING: error inserting an iptable rule -- %s", err)

    def insert_rule(self, rule, force=False):
        if not self.exists(rule):
            log("insert_rule: %s", rule)
            self.iptables(['-I'] + rule)
        elif force:
            self.delete_rule(rule)
            self.iptables(['-I'] + rule)

    def append_rule(self, rule, force=False):
        if not self.exists(rule):
            log("append_rule: %s", rule)
            self.iptables(['-A'] + rule)
        elif force:
            self.delete_rule(rule, force=True)
            self.iptables(['-A'] + rule)

    def delete_rule(self, rule, force=False):
        if self.exists(rule):
            log("delete_rule: %s", rule)
            try:
                self.iptables(['-D'] + rule)
            except Exception, mesg:
                log("delete_rule error -- %s", mesg)
                # checking for exists is not 100% for uid rules module
                pass
        elif force:
            try:
                self.iptables(['-D'] + rule)
            except:
                pass

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
        self.iptables(['-F'])    # clear the normal rules
        self.iptables(['-t', 'mangle', '-F'])    # clear the mangle rules used to shape traffic (using tc)
        return {'status':'success'}

    def show(self, names=False):
        """
        Show all firewall rules.   (NON-JSON interface!)
        """
        if names:
            os.system("iptables -v -L")
        else:
            os.system("iptables -v -n -L")

    def outgoing(self, whitelist_hosts='', whitelist_hosts_file='', whitelist_users='', blacklist_users='', bandwidth_Kbps=1000):
        """
        Block all outgoing traffic, except what is given
        in a specific whitelist and DNS.  Also throttle
        bandwidth of outgoing SMC *user* traffic.
        """
        if whitelist_users or blacklist_users:
            self.outgoing_user(whitelist_users, blacklist_users)

        if whitelist_hosts_file:
            v = []
            for x in open(whitelist_hosts_file).readlines():
                i = x.find('#')
                if i != -1:
                    x = x[:i]
                x = x.strip()
                if x:
                    v.append(x)
            self.outgoing_whitelist_hosts(','.join(v))
        self.outgoing_whitelist_hosts(whitelist_hosts)

        # Block absolutely all outgoing traffic *from* lo to not loopback on same
        # machine: this is to make it so a project
        # can serve a network service listening on eth0 safely without having to worry
        # about security at all, and still have it be secure, even from users on
        # the same machine.  We insert and remove this every time we mess with the firewall
        # rules to ensure that it is at the very top.
        self.insert_rule(['OUTPUT', '-o', 'lo', '-d', socket.gethostname(), '-j', 'REJECT'], force=True)

        if bandwidth_Kbps:
            self.configure_tc(bandwidth_Kbps)

        return {'status':'success'}
 
    def configure_tc(self, bandwidth_Kbps):
        try:
            cmd("tc qdisc  del dev eth0 root".split())
        except:
            pass # will fail if not already configured
        cmd("tc qdisc add dev eth0 root handle 1:0 htb default 99".split())
        cmd(("tc class add dev eth0 parent 1:0 classid 1:10 htb rate %sKbit ceil %sKbit prio 2"%(bandwidth_Kbps,bandwidth_Kbps)).split()) 
        cmd("tc qdisc add dev eth0 parent 1:10 handle 10: sfq perturb 10".split())
        cmd("tc filter add dev eth0 parent 1:0 protocol ip prio 1 handle 1 fw classid 1:10".split())

    def outgoing_whitelist_hosts(self, whitelist):
        whitelist = [x.strip() for x in whitelist.split(',')]
        # determine the ip addresses of our locally configured DNS servers
        for x in open("/etc/resolv.conf").readlines():
            v = x.split()
            if v[0] == 'nameserver':
                log("adding nameserver %s to whitelist", v[1])
                whitelist.append(v[1])
        whitelist = ','.join([x for x in whitelist if x])
        log("whitelist: %s", whitelist)

        # Insert whitelist rule at the beginning of OUTPUT chain.
        # Anything that matches this will immediately be accepted to go out.
        if whitelist:
            self.insert_rule(['OUTPUT', '-d', whitelist, '-j', 'ACCEPT'])

        # Loopback traffic: allow all OUTGOING (so the rule below doesn't cause trouble);
        # needed, e.g., by Jupyter notebook and probably other services.
        self.insert_rule(['OUTPUT', '-o', 'lo', '-j', 'ACCEPT'])

        # Block all new outgoing connections that we didn't allow above.
        self.append_rule(['OUTPUT', '-m', 'state', '--state', 'NEW', '-j', 'REJECT'])

    def outgoing_user(self, add='', remove=''):
        def rules(user):
            # returns rule for allowing this user and whether rule is already in chain
            v = [['OUTPUT', '-m', 'owner', '--uid-owner', user , '-j', 'ACCEPT']]
            if user != 'salvus' and user != 'root':
                # Make it so this user has their bandwidth throttled so DOS attacks are more difficult, and also spending
                # thousands in bandwidth is harder.
                # -t mangle mangles packets by adding a mark, which is needed by tc.
                # -p all -- match all protocols, including both tcp and udp
                # ! -d 10.240.0.0/16 ensures this rule does NOT apply to any destination inside GCE.
                # -m owner --uid-owner [user] makes the rule apply only to this user
                # -j MARK --set-mark 0x1 marks packet so the throttling tc filter we created elsewhere gets applied
                v.append(['OUTPUT', '-t', 'mangle', '-p', 'all', '!', '-d', '10.240.0.0/16', '-m', 'owner', '--uid-owner', user , '-j', 'MARK', '--set-mark', '0x1'])
            return v

        for user in remove.split(','):
            if user:
                for x in rules(user):
                    self.delete_rule(x, force=True)

        for user in add.split(','):
            if user:
                try:
                    for x in rules(user):
                        self.insert_rule(x, force=True)
                except Exception, mesg:
                    log("\nWARNING whitelisting user: %s\n", str(mesg).splitlines()[:-1])

    def incoming(self, whitelist_hosts='', whitelist_ports=''):
        """
        Deny all other incoming traffic, except from the
        explicitly given whitelist of machines.
        """
        # Allow some incoming packets from the whitelist of ports.
        for p in whitelist_ports.split(','):
            self.insert_rule(['INPUT', '-p', 'tcp', '--dport', p, '-j', 'ACCEPT'])

        # Allow incoming connections/packets from anything in the whitelist
        if not whitelist_hosts.strip():
            v = []
            for t in ['smc', 'storage', 'admin']:
                s = cmd("curl -s http://metadata.google.internal/computeMetadata/v1/project/attributes/%s-servers -H 'Metadata-Flavor: Google'"%t)
                v.append(s.replace(' ', ','))
            whitelist_hosts = ','.join(v)

        self.insert_rule(['INPUT', '-s', whitelist_hosts, '-j', 'ACCEPT'])

        # Loopback traffic: allow all INCOMING (so the rule below doesn't cause trouble);
        # needed, e.g., by Jupyter notebook and probably other services.
        self.append_rule(['INPUT', '-i', 'lo', '-j', 'ACCEPT'])

        # Block *new* packets arriving via a new connection from anywhere else.  We
        # don't want to block all packages -- e.g., if something on this machine
        # connects to DNS, it should be allowed to receive the answer back.
        self.append_rule(['INPUT', '-m', 'state', '--state', 'NEW', '-j', 'DROP'])

        return {'status':'success'}

if __name__ == "__main__":

    import socket
    hostname = socket.gethostname()
    log("hostname=%s",hostname)
    if not hostname.startswith('compute') and not hostname.startswith('web'):
        log("skipping firewall since this is not a production SMC machine")
        sys.exit(0)

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
                result = {'error':str(mesg)}
            print json.dumps(result)
            if errors:
                sys.exit(1)
        subparser.set_defaults(func=g)

    parser_outgoing = subparsers.add_parser('outgoing', help='create firewall to block all outgoing traffic, except explicit whitelist)')
    parser_outgoing.add_argument('--whitelist_hosts',help="comma separated list of sites to whitelist (not run if empty)", default='')
    parser_outgoing.add_argument('--whitelist_hosts_file',help="filename of file with one line for each host (comments and blank lines are ignored)", default='')
    parser_outgoing.add_argument('--whitelist_users',help="comma separated list of users to whitelist", default='')
    parser_outgoing.add_argument('--blacklist_users',help="comma separated list of users to remove from whitelist", default='')
    parser_outgoing.add_argument('--bandwidth_Kbps',help="throttle user bandwidth", default=250)
    f(parser_outgoing)

    parser_incoming = subparsers.add_parser('incoming', help='create firewall to block all incoming traffic except ssh, nfs, http[s], except explicit whitelist')
    parser_incoming.add_argument('--whitelist_hosts',help="comma separated list of sites to whitelist (default: use metadata server to get smc vms)", default='')
    parser_incoming.add_argument('--whitelist_ports',help="comma separated list of ports to whitelist", default='22,80,111,443')
    f(parser_incoming)

    f(subparsers.add_parser('clear', help='clear all rules'))

    parser_show = subparsers.add_parser('show', help='show all rules')
    parser_show.add_argument('--names',help="show hostnames (potentially expensive DNS lookup)", default=False, action="store_const", const=True)
    f(parser_show)

    args = parser.parse_args()
    args.func(args)



