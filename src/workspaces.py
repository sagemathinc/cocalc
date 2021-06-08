#!/usr/bin/env python
"""
- build:
build one or all packages

- status
   -
"""

import argparse, os, shutil, time


def cmd(s, path=None):
    home = os.path.abspath(os.curdir)
    try:
        desc = s
        if path is not None:
            os.chdir(path)
            desc += " # in '%s'" % path
        print(desc)
        if os.system(s):
            raise RuntimeError("Error executing '%s'" % s)
    finally:
        os.chdir(home)


def thread_map(callable, inputs, nb_threads=10):
    if len(inputs) == 0:
        return []
    if nb_threads == 1:
        return [callable(x) for x in inputs]
    from multiprocessing.pool import ThreadPool
    tp = ThreadPool(nb_threads)
    return tp.map(callable, inputs)


def matches(package, packages):
    if not packages: return True
    name = package.split('/')[-1]
    for term in packages.split(','):
        if term in name:
            return True
    return False


def packages(args):
    # Compute the packages
    # The order *is* important, since it's assumed by
    # the make command below!
    # We may automate figuring out dependencies later.
    v = ['packages/cdn', 'smc-util', 'smc-webapp', 'smc-hub', 'webapp-lib', ]
    for x in os.listdir('packages'):
        path = os.path.join("packages", x)
        if path not in v and os.path.isdir(path):
            v.append(path)
    p = [x for x in v if matches(x, args.packages)]
    print("Packages: ", ', '.join(p))
    return p


def banner(s):
    print("\n" + "=" * 70)
    print("|| " + s)
    print("=" * 70 + "\n")


def make(args):
    v = packages(args)

    # We do NOT do this in parallel, since there are significant
    # subtle dependencies, even with `npm ci` due to workspaces.
    # Also, when there are errors, it is difficult to understand
    # where they come from when building and installing in parallel.
    for path in v:
        banner("Installing and building %s..." % path)
        cmd("time npm ci", path)
        cmd("time npm run build", path)


def clean(args):
    v = packages(args)

    paths = []
    for path in v:
        for x in ['node_modules', 'dist']:
            y = os.path.abspath(os.path.join(path, x))
            if os.path.exists(y):
                paths.append(y)

    def f(path):
        print("rm -rf '%s'" % path)
        shutil.rmtree(path)

    if (len(paths) == 0):
        banner("No node_modules or dist directories")
    else:
        banner("Deleting " + ', '.join(paths))
        thread_map(f, paths, nb_threads=10)

    banner("Running 'npm run clean' if it exists...")

    def g(path):
        cmd("npm run clean --if-present", path)

    thread_map(g, [os.path.abspath(path) for path in v], nb_threads=10)


def npm(args):
    v = packages(args)
    inputs = []
    for path in v:
        inputs.append([
            'time npm ' + ' '.join(['%s' % x for x in args.args]),
            os.path.abspath(path)
        ])

    def f(args):
        cmd(*args)

    thread_map(f, inputs)


def version_check(args):
    cmd("scripts/check_npm_packages.py")


def package_status(path):
    banner("Status %s" % path)


def status(args):
    v = packages(args)
    for path in v:
        package_status(path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(prog='workspaces')
    parser.add_argument(
        '--packages',
        type=str,
        default='',
        help=
        '(default: everything) "foo,bar" matches only packages with "foo" or "bar" in  their name'
    )
    subparsers = parser.add_subparsers(help='sub-command help')

    subparser = subparsers.add_parser('make',
                                      help='install and build everything')
    subparser.set_defaults(func=make)

    subparser = subparsers.add_parser(
        'clean', help='delete dist and node_modules folders')
    subparser.set_defaults(func=clean)

    subparser = subparsers.add_parser(
        'npm', help='do "npm ..." in each package; e.g., use for "npm ci"')
    subparser.add_argument('args',
                           type=str,
                           nargs='*',
                           default='',
                           help='arguments to npm')
    subparser.set_defaults(func=npm)

    subparser = subparsers.add_parser(
        'version-check', help='version consistency checks across packages')
    subparser.set_defaults(func=version_check)

    subparser = subparsers.add_parser('status',
                                      help='get status of each package')
    subparser.set_defaults(func=status)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)
