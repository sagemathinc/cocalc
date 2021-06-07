#!/usr/bin/env python
"""
- build:
build one or all packages

- status
   -
"""

import argparse, os, time


def cmd(s, path=None):
    home = os.path.abspath(os.curdir)
    try:
        desc = s
        if path is not None:
            os.chdir(path)
            desc += " (in '%s')"%path
        print(desc)
        if os.system(s):
            raise RuntimeError("Error executing '%s'" % s)
    finally:
        os.chdir(home)



def matches(package, target):
    if not target: return True
    name = package.split('/')[-1]
    for term in target.split(','):
        if term in name:
            return True
    return False


def packages(args):
    # Compute the packages
    v = ['smc-util', 'smc-hub', 'smc-webapp', 'webapp-lib']
    for x in os.listdir('packages'):
        path = os.path.join("packages", x)
        if os.path.isdir(path):
            v.append(path)
    return [x for x in v if matches(x, args.target)]


def banner(s):
    print("\n" + "=" * 70)
    print("|| " + s)
    print("=" * 70 + "\n")


def build(args):
    v = packages(args)

    print("Packages: ", ', '.join(v))

    for path in v:
        banner("Building %s..." % path)
        cmd("time npm run build", path)


def version_check(args):
    cmd("scripts/check_npm_packages.py")


def package_status(path):
    banner("Status %s" % path)

def status(args):
    v = packages(args)
    for path in v:
        package_status(path)


def packages_arg(parser):
    parser.add_argument(
        'target',
        type=str,
        nargs='?',
        default='',
        help=
        '(default: everything) "foo,bar" matches only packages with "foo" or "bar" in  their name'
    )


if __name__ == '__main__':
    parser = argparse.ArgumentParser(prog='workspaces')
    subparsers = parser.add_subparsers(help='sub-command help')

    subparser = subparsers.add_parser('build', help='build each package')
    packages_arg(subparser)
    subparser.set_defaults(func=build)

    subparser = subparsers.add_parser(
        'version-check', help='version consistency checks across packages')
    subparser.set_defaults(func=version_check)

    subparser = subparsers.add_parser('status',
                                      help='get status of each package')
    packages_arg(subparser)
    subparser.set_defaults(func=status)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
