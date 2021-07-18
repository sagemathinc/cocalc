#!/usr/bin/env python

import os, socket, time

os.chdir(os.environ['SALVUS_ROOT'])


def cmd(s):
    print(s)
    if os.WEXITSTATUS(os.system(s)):
        raise RuntimeError


def hub(command, server_id):
    cmd("hub {command} {args} ".format(command=command,
                                       args=hub_args(server_id)))


def hub_args(server_id):
    if server_id != '':
        port = 5000 + 2 * int(server_id)
        proxy_port = port + 1
    else:
        if args.port:
            port = int(args.port)
        elif args.port == -1:
            port = 5000
        else:
            port = 0
        if args.proxy_port:
            proxy_port = int(args.proxy_port)
        elif args.proxy_port == -1:
            proxy_port = 5001
        else:
            proxy_port = 0
        if args.share_port:
            share_port = int(args.share_port)
        else:
            share_port = 0

        agent_port = int(args.agent_port) if args.agent_port else 0

    s = "--host={hostname} --websocket-server --agent_port {agent_port} {mentions} --share_path {share_path}  ".format(
        hostname=args.hostname,
        server_id=server_id,
        agent_port=agent_port,
        mentions="--mentions" if args.mentions else "",
        share_path=args.share_path)

    if args.database_nodes:
        s += ' --database_nodes {database_nodes} '.format(
            database_nodes=args.database_nodes)

    if args.kucalc:
        s += ' --kucalc '

    if args.lti:
        s += ' --lti '

    if args.landing:
        s += ' --landing'

    if args.dev:
        s += ' --dev '

    if args.single:
        s += ' --single '


    if args.personal:
        s += ' --personal '

    if args.update:
        s += ' --update '

    if args.test:
        s += ' --test '

    if args.foreground:
        s += ' --foreground '
    else:
        logpath = "%s/../logs" % os.environ['SALVUS_ROOT']
        pidpath = "%s/../pids" % os.environ['SALVUS_ROOT']
        if not os.path.exists(logpath):
            os.makedirs(logpath)
        if not os.path.exists(pidpath):
            os.makedirs(pidpath)
        logfile = "%s/hub%s.log" % (logpath, server_id)
        pidfile = "%s/hub%s.pid" % (pidpath, server_id)
        s += " --logfile {logfile} --pidfile {pidfile} ".format(
            logfile=logfile, pidfile=pidfile)

    if server_id:
        s += ' --id ' + server_id

    return s


def start_hub(server_id):
    if args.foreground:
        hub('', server_id)
    else:
        hub('start', server_id)


def stop_hub(server_id):
    hub('stop', server_id)


def restart_hub(server_id):
    hub('stop', server_id)
    time.sleep(1)
    hub('start', server_id)


def gap():
    print("waiting %s seconds before restarting next hub" % args.gap)
    time.sleep(args.gap)


def start(args):
    for server_id in args.id.split(','):
        start_hub(server_id)


def stop(args):
    for server_id in args.id.split(','):
        stop_hub(server_id)


def restart(args):
    v = args.id.split(',')
    for i, server_id in enumerate(v):
        restart_hub(server_id)
        if i < len(v) - 1:
            gap()


if __name__ == "__main__":

    import argparse
    parser = argparse.ArgumentParser(description="Control hub servers")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser.add_argument(
        "--id",
        help="comma separated list ids of servers to start/stop",
        dest="id",
        default="",
        type=str)

    parser.add_argument('--database_nodes',
                        help="",
                        dest='database_nodes',
                        default='')

    parser.add_argument('--foreground',
                        help="foreground",
                        dest='foreground',
                        action="store_const",
                        const=True,
                        default=False)

    parser.add_argument('--dev',
                        help="dev",
                        dest='dev',
                        action="store_const",
                        const=True,
                        default=False)

    parser.add_argument('--kucalc',
                        help="kucalc",
                        dest='kucalc',
                        action="store_const",
                        const=True,
                        default=False)

    parser.add_argument('--lti',
                        help="lti",
                        dest='lti',
                        action="store_const",
                        const=True,
                        default=False)

    parser.add_argument('--landing',
                        help="landing",
                        dest='landing',
                        action="store_const",
                        const=True,
                        default=False)

    parser.add_argument('--single',
                        help="single",
                        dest='single',
                        action="store_const",
                        const=True,
                        default=False)

    parser.add_argument('--personal',
                        help="personal",
                        dest='personal',
                        action="store_const",
                        const=True,
                        default=False)

    parser.add_argument('--update',
                        help="update",
                        dest='update',
                        action="store_const",
                        const=True,
                        default=False)

    parser.add_argument('--test',
                        help="test",
                        dest='test',
                        action="store_const",
                        const=True,
                        default=False)

    parser.add_argument('--agent_port', dest='agent_port', type=int, default=0)

    parser.add_argument('--mentions',
                        help="mentions",
                        dest='mentions',
                        action="store_const",
                        const=True,
                        default=False)

    parser.add_argument('--share_path',
                        dest='share_path',
                        type=str,
                        default='')

    parser.add_argument(
        "--hostname",
        help="hostname to listen on [default: hostname of computer]",
        dest="hostname",
        default=socket.gethostname(),
        type=str)

    parser.add_argument(
        "--gap",
        help=
        "time (in seconds) to wait before restarting each hub [default: 10]",
        dest="gap",
        default=10,
        type=int)

    parser_stop = subparsers.add_parser('stop', help='stop the hubs')
    parser_stop.set_defaults(func=stop)

    parser_start = subparsers.add_parser('start', help='start the hubs')
    parser_start.set_defaults(func=start)

    parser_restart = subparsers.add_parser('restart', help='restart the hubs')
    parser_restart.set_defaults(func=restart)

    args = parser.parse_args()
    args.func(args)
