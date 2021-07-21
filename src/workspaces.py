#!/usr/bin/env python3
"""
PURPOSE: Automate building, installing, and publishing our modules.  This is like a
little clone of "lerna" for our purposes.

NOTES:
 - We cannot run "npm ci" in parallel across modules, since we're using workspaces,
   and doing several npm ci at once totally breaks npm.  Of course, it also makes
   it difficult to understand error messages too.
 - Similar for "npm run build" in parallel -- it subtly breaks.

"""

import argparse, os, shutil, subprocess, sys, time

# Unfortunately some parts of the build assume these are defined.  So for
# now we define them.
os.environ['SALVUS_ROOT'] = os.environ['SMC_ROOT'] = os.path.abspath(
    os.path.dirname(__file__))


def handle_path(s, path=None, verbose=True):
    desc = s
    if path is not None:
        os.chdir(path)
        desc += " # in '%s'" % path
    if verbose:
        print(desc)


def cmd(s, path=None, verbose=True):
    home = os.path.abspath(os.curdir)
    try:
        handle_path(s, path, verbose)
        if os.system(s):
            raise RuntimeError("Error executing '%s'" % s)
    finally:
        os.chdir(home)


def run(s, path=None, verbose=True):
    home = os.path.abspath(os.curdir)
    try:
        handle_path(s, path, verbose)
        a = subprocess.run(s, shell=True, stdout=subprocess.PIPE)
        out = a.stdout.decode('utf8')
        if a.returncode:
            raise RuntimeError("Error executing '%s'" % s)
        return out
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
    if not packages and not exclude: return True
    name = package.split('/')[-1]
    for pkg in packages.split(','):
        if pkg == name:
            return True
    return False


def packages(args):
    # Compute all the packages.  Explicit order in some cases *does* matter as noted in comments.
    v = [
        'packages/cdn',  # smc-hub assumes this is built
        'smc-util',
        'smc-util-node',
        'smc-hub',
        'smc-webapp',
        'smc-project',
        'webapp-lib'
    ]
    for x in os.listdir('packages'):
        path = os.path.join("packages", x)
        if path not in v and os.path.isdir(path):
            v.append(path)

    # Filter to only the ones in packages (if given)
    if args.packages:
        packages = set(args.packages.split(','))
        v = [x for x in v if x.split('/')[-1] in packages]

    # Only take things not in exclude
    if args.exclude:
        exclude = set(args.exclude.split(','))
        v = [x for x in v if x.split('/')[-1] not in exclude]

    print("Packages: ", ', '.join(v))
    return v


def banner(s):
    print("\n" + "=" * 70)
    print("|| " + s)
    print("=" * 70 + "\n")


def ci(args):
    v = packages(args)
    # First do npm ci not in parallel (which doesn't work with workspaces):
    for path in v:
        cmd("npm ci", path)


# Build all the packages.
def build(args):
    v = packages(args)

    for path in v:
        if path != 'packages/static':
            dist = os.path.join(path, 'dist')
            if os.path.exists(dist):
                # clear dist/ dir
                shutil.rmtree(dist)
        cmd("npm run build", path)


def clean(args):
    v = packages(args)

    if args.dist_only:
        folders = ['dist']
    elif args.node_modules_only:
        folders = ['node_modules']
    else:
        folders = ['node_modules', 'dist']

    paths = []
    for path in v:
        for x in folders:
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


def delete_package_lock(args):
    def f(path):
        p = os.path.join(path, 'package-lock.json')
        if os.path.exists(p):
            os.unlink(p)

    thread_map(f, [os.path.abspath(path) for path in packages(args)],
               nb_threads=10)


def npm(args):
    v = packages(args)
    inputs = []
    for path in v:
        s = 'npm ' + ' '.join(['%s' % x for x in args.args])
        inputs.append([s, os.path.abspath(path)])

    def f(args):
        cmd(*args)

    if args.parallel:
        thread_map(f, inputs)
    else:
        thread_map(f, inputs, 1)


def version_check(args):
    cmd("scripts/check_npm_packages.py")


NEVER = '0000000000'


def last_commit_when_version_changed(path):
    return run('git blame package.json |grep \'  "version":\'', path,
               False).split()[0]


def package_status(args, path):
    commit = last_commit_when_version_changed(path)
    print("\nPackage:", path)
    sys.stdout.flush()
    if commit == NEVER:
        print("never committed")
        return
    cmd("git diff  --name-status %s ." % commit, path, False)


def package_diff(args, path):
    commit = last_commit_when_version_changed(path)
    print("\nPackage:", path)
    sys.stdout.flush()
    if commit == NEVER:
        print("never committed")
        return
    cmd("git diff  %s ." % commit, path, False)


def publish_package(args, path):
    print("\nPackage:", path)
    sys.stdout.flush()
    commit = last_commit_when_version_changed(path)
    if path.endswith('static'):
        # We bump the version *before* for the static build, since
        # the version is part of what is included in the build.
        print("BUMP VERSION")
        cmd(f"npm --no-git-tag-version version {args.newversion}", path)
    # Do the build
    cmd("npm run build", path)

    if not path.endswith('static'):
        # Success -- bump the version before publishing
        cmd(f"npm --no-git-tag-version version {args.newversion}", path)

    try:
        # And now publish it:
        if args.tag:
            cmd(f"npm publish --tag {args.tag}", path)
        else:
            cmd("npm publish", path)
    except:
        print(
            f"Publish failed; you might need to manually revert the version in '{path}/package.json'."
        )
    cmd(
        f"git commit -v . -m 'Publish new version of package {path} to npm package repo.'",
        path)


def status(args):
    for path in packages(args):
        package_status(args, path)


def diff(args):
    for path in packages(args):
        package_diff(args, path)


def publish(args):
    if not args.tag:
        raise RuntimeError("tag must be specified (e.g. 'latest')")
    if not args.newversion:
        raise RuntimeError(
            "newversion must be specified (e.g. 'patch', 'minor', 'major')")
    for path in packages(args):
        publish_package(args, path)


def main():
    def packages_arg(parser):
        parser.add_argument(
            '--packages',
            type=str,
            default='',
            help=
            '(default: ""=everything) "foo,bar" means only the packages named foo and bar'
        )
        parser.add_argument(
            '--exclude',
            type=str,
            default='',
            help=
            '(default: ""=exclude nothing) "foo,bar" means exclude foo and bar'
        )

    parser = argparse.ArgumentParser(prog='workspaces')
    subparsers = parser.add_subparsers(help='sub-command help')

    subparser = subparsers.add_parser('ci',
                                      help='install deps for all modules')
    packages_arg(subparser)
    subparser.set_defaults(func=ci)

    subparser = subparsers.add_parser('build',
                                      help='build all modules (use ci first)')
    packages_arg(subparser)
    subparser.set_defaults(func=build)

    subparser = subparsers.add_parser(
        'clean', help='delete dist and node_modules folders')
    packages_arg(subparser)
    subparser.add_argument('--dist-only',
                           action="store_const",
                           const=True,
                           help="only delete dist directory")
    subparser.add_argument('--node-modules-only',
                           action="store_const",
                           const=True,
                           help="only delete node_modules directory")
    subparser.set_defaults(func=clean)

    subparser = subparsers.add_parser(
        'delete-package-lock',
        help='delete package lock files so they can be recreated')
    packages_arg(subparser)
    subparser.set_defaults(func=delete_package_lock)

    subparser = subparsers.add_parser(
        'npm', help='do "npm ..." in each package; e.g., use for "npm ci"')
    packages_arg(subparser)
    subparser.add_argument('args',
                           type=str,
                           nargs='*',
                           default='',
                           help='arguments to npm')
    subparser.add_argument('--parallel',
                           action="store_const",
                           const=True,
                           help="run in parallel")
    subparser.set_defaults(func=npm)

    subparser = subparsers.add_parser(
        'version-check', help='version consistency checks across packages')
    subparser.set_defaults(func=version_check)

    subparser = subparsers.add_parser(
        'status', help='files changed in package since last version change')
    packages_arg(subparser)
    subparser.set_defaults(func=status)

    subparser = subparsers.add_parser(
        'diff', help='diff in package since last version change')
    packages_arg(subparser)
    subparser.set_defaults(func=diff)

    subparser = subparsers.add_parser(
        'publish', help='update version, commit git repo, and publish to npm')
    packages_arg(subparser)
    subparser.add_argument(
        "--tag",
        type=str,
        help=
        "Registers the published package with the given tag, such that npm install <name>@<tag> will install this version."
    )
    subparser.add_argument(
        "--newversion",
        type=str,
        help=
        "major | minor | patch | premajor | preminor | prepatch | prerelease")
    subparser.set_defaults(func=publish)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)


if __name__ == '__main__':
    main()
