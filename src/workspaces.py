#!/usr/bin/env python3
"""
PURPOSE: Automate building, installing, and publishing our modules.
This is like a little clone of "lerna" for our purposes.

NOTES:
 - We cannot run "npm ci" in parallel across modules, since we're using workspaces,
   and doing several npm ci at once totally breaks npm.  Of course, it also makes
   it difficult to understand error messages too.
 - Similar for "npm run build" in parallel -- it subtly breaks.

"""

import argparse, json, os, shutil, subprocess, sys, time


def newest_file(path):
    # See https://gist.github.com/brwyatt/c21a888d79927cb476a4.
    return os.popen(
        f'cd "{path}"&& find . -type f -printf "%C@ %p\n" | sort -rn | head -n 1 | cut -d" " -f2'
    ).read().strip()


SUCCESSFUL_BUILD = ".successful-build"


def needs_build(package):
    # Code below was hopelessly naive, e.g, a failed build would not get retried.
    # We only need to do a build if the newest file in the tree is not
    # in the dist directory.
    path = os.path.join(os.path.dirname(__file__), package)
    newest = newest_file(path)
    return not newest.startswith('./' + SUCCESSFUL_BUILD)


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


def all_packages():
    # Compute all the packages.  Explicit order in some cases *does* matter as noted in comments.
    v = [
        'packages/cdn',  # packages/hub assumes this is built
        'packages/util',
        'packages/util-node',
        'packages/hub',
        'packages/frontend',
        'packages/project',
        'packages/assets'
    ]
    for x in os.listdir('packages'):
        path = os.path.join("packages", x)
        if path not in v and os.path.isdir(path):
            v.append(path)
    return v


def packages(args):
    v = all_packages()
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


def package_json(package):
    return json.loads(open(f'{package}/package.json').read())


def write_package_json(package, x):
    open(f'{package}/package.json', 'w').write(json.dumps(x, indent=2))


def dependent_packages(package):
    # Get a list of the packages
    # it depends on by reading package.json
    x = package_json(package)
    if "workspaces" not in x:
        # no workspaces
        return []
    v = []
    for path in x["workspaces"]:
        # path is a relative path
        npath = os.path.normpath(os.path.join(package, path))
        if npath != package:
            v.append(npath)
    return v


def get_package_version(package):
    return package_json(package)["version"]


def get_package_npm_name(package):
    return package_json(package)["name"]


def update_dependent_versions(package):
    """
    Update the versions of all of the workspaces that this
    package depends on.  The versions are set to whatever the
    current version is in the dependent packages package.json.

    There is a problem here, if you are publishing two
    packages A and B with versions vA and vB.  If you first publish
    A, then you set it as depending on B@vB.  However, when you then
    publish B you set its new version as vB+1, so A got published
    with the wrong version.  It's thus important to first
    update all the versions of the packages that will be published
    in a single phase, then update the dependent version numbers, and
    finally actually publish the packages to npm.  There will unavoidably
    be an interval of time when some of the packages are impossible to
    install (e.g., because A got published and depends on B@vB+1, but B
    isn't yet published).
    """
    x = package_json(package)
    changed = False
    for dependent in dependent_packages(package):
        print(f"Considering '{dependent}'")
        try:
            package_version = '^' + get_package_version(dependent)
        except:
            print(f"Skipping '{dependent}' since package not available")
            continue
        npm_name = get_package_npm_name(dependent)
        dev = npm_name in x.get("devDependencies", {})
        if dev:
            current_version = x.get("devDependencies", {}).get(npm_name, '')
        else:
            current_version = x.get("dependencies", {}).get(npm_name, '')
        # print(dependent, npm_name, current_version, package_version)
        if current_version != package_version:
            print(
                f"{package}: {dependent} changed from '{current_version}' to '{package_version}'"
            )
            x['devDependencies' if dev else 'dependencies'][
                npm_name] = package_version
            changed = True
    if changed:
        write_package_json(package, x)


def update_all_dependent_versions():
    for package in all_packages():
        update_dependent_versions(package)


def banner(s):
    print("\n" + "=" * 70)
    print("|| " + s)
    print("=" * 70 + "\n")


def ci(args):
    v = packages(args)
    # First do npm ci not in parallel (which doesn't work with workspaces):
    for path in v:
        cmd("npm ci", path)


# Build all the packages that need to be built.
def build(args):
    v = [package for package in packages(args) if needs_build(package)]
    CUR = os.path.abspath('.')

    def f(path):
        if not args.parallel and path != 'packages/static':
            # NOTE: in parallel mode we don't delete or there is no
            # hope of this working.
            dist = os.path.join(CUR, path, 'dist')
            if os.path.exists(dist):
                # clear dist/ dir
                shutil.rmtree(dist)
        package_path = os.path.join(CUR, path)
        cmd("npm run build", package_path)
        # The build succeeded, so touch a file
        # to indicate this, so we won't build again
        # until something is newer than this file
        cmd("touch " + SUCCESSFUL_BUILD, package_path)

    if args.parallel:
        thread_map(f, v)
    else:
        thread_map(f, v, 1)


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


def last_commit_when_version_changed(package):
    return run('git blame package.json |grep \'  "version":\'', package,
               False).split()[0]


def package_status(args, package):
    commit = last_commit_when_version_changed(package)
    print("\nPackage:", package)
    sys.stdout.flush()
    if commit == NEVER:
        print("never committed")
        return
    cmd("git diff  --name-status %s ." % commit, package, False)


def package_diff(args, package):
    commit = last_commit_when_version_changed(package)
    print("\nPackage:", package)
    sys.stdout.flush()
    if commit == NEVER:
        print("never committed")
        return
    cmd("git diff  %s ." % commit, package, False)


# Returns true if the package version in package.json if different
# from what was last committed to git.  More precisely, the 'version:'
# line has changed since the last git commit.
def package_version_is_modified_from_last_git_commit(package):
    # If the version: line in package.json has changed since the
    # last commit (or never commited), then git says the commit
    # where it changed is '0000000000'.   We thus bump the version
    # precisely when the commit where that line last changed is
    # something other than '0000000000'.
    return run("git blame package.json|grep '\"version\":'",
               package).startswith(NEVER)


# Increase the package version, unless it has already
# changed from what it was when the package.json file
# was last commited to git.  NOTE: we're comparing to
# the last git commit, NOT what is published on npmjs since:
#   - it is slow to get that info from npmjs
#   - it's difficult to deal with tags there
def bump_package_version_if_necessary(package, newversion):
    print(f"Check if we need to bump version of {package}")
    if package_version_is_modified_from_last_git_commit(package):
        print(f"No, version of {package} already changed")
        return
    print(f"Yes, bumping version of {package} via {newversion}")
    cmd(f"npm --no-git-tag-version version {newversion}", package)


def publish_package(args, package):
    print("\nPackage:", package)
    sys.stdout.flush()

    if not package_version_is_modified_from_last_git_commit(package):
        print(
            f"WARNING: You *might* need to first run update-version for '{package}', or somehow update the version in {package}/package.json."
        )
    # Do the build
    #  First ensure BASE_PATH is not set; we only want to publish to
    #  npm with no custom base path.
    del os.environ['BASE_PATH']
    cmd("npm run build", package)
    try:
        # And now publish it:
        if args.tag:
            cmd(f"npm publish --tag {args.tag}", package)
        else:
            cmd("npm publish", package)
    except:
        print(
            f"Publish failed; you might need to manually revert the version in '{package}/package.json'."
        )
    try:
        cmd(
            f"git commit -v . -m 'Publish new version of package {package} to npmjs package repo.'",
            package)
    except:
        print(f"Didn't commit {package}; this may be fine.")


def status(args):
    for package in packages(args):
        package_status(args, package)


def diff(args):
    for package in packages(args):
        package_diff(args, package)


def update_version(args):
    if not args.newversion:
        raise RuntimeError(
            "newversion must be specified (e.g. 'patch', 'minor', 'major')")

    # First we bump the package versions, if necessary
    print("Updating versions if necessary...")
    for package in packages(args):
        bump_package_version_if_necessary(package, args.newversion)


def publish(args):
    # We first update all the explicit workspace version dependencies.
    # I.e., we make it so all the @cocalc/packagename:"^x.y.z" lines
    # in package.json are correct and reflect the versions of our packages here.
    print("Updating dependent versions...")
    for package in packages(args):
        update_dependent_versions(package)

    # Finally, we build and publish all of our packages to npm.
    for package in packages(args):
        publish_package(args, package)


def node_version_check():
    version = int(os.popen('node --version').read().split('.')[0][1:])
    if version < 14:
        err = f"CoCalc requires node.js v14, but you're using node v{version}."
        if os.environ.get("COCALC_USERNAME",
                          '') == 'user' and 'COCALC_PROJECT_ID' in os.environ:
            err += '\nIf you are using https://cocalc.com, put ". /cocalc/nvm/nvm.sh" in ~/.bashrc\nto get an appropriate version of node.'
        raise RuntimeError(err)


def main():
    node_version_check()

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
        parser.add_argument(
            '--parallel',
            action="store_const",
            const=True,
            help=
            'if given, do all in parallel; this will not work in some cases and may be ignored in others'
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

    subparser = subparsers.add_parser('update-version',
                                      help='update version of packages')
    packages_arg(subparser)
    subparser.add_argument(
        "--newversion",
        type=str,
        help=
        "major | minor | patch | premajor | preminor | prepatch | prerelease")
    subparser.set_defaults(func=update_version)

    subparser = subparsers.add_parser(
        'publish',
        help=
        'publish to npm and commit and changes to git in directory containing the package.   You must call update-version for the package(s) you wish to publish first, or manually edit package.json.'
    )
    packages_arg(subparser)
    subparser.add_argument(
        "--tag",
        type=str,
        help=
        "Registers the published package with the given tag, such that npm install <name>@<tag> will install this version."
    )
    subparser.set_defaults(func=publish)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)


if __name__ == '__main__':
    main()
