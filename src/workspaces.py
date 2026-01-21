#!/usr/bin/env python3
"""
PURPOSE: Automate building, installing, and publishing our modules.
This is like a little clone of "lerna" for our purposes.

NOTE: I wrote this initially using npm and with the goal of publishing
to npmjs.com.   Now I don't care at all about publishing to npmjs.com,
and we're using pnpm.  So this is being turned into a package just
for cleaning/installing/building.

TEST:
 - This should always work:  "mypy workspaces.py"
"""

import argparse, json, os, platform, shutil, subprocess, sys, time

from typing import Any, Optional, Callable, List

MAX_PACKAGE_LOCK_SIZE_MB = 5


def newest_file(path: str) -> str:
    if platform.system() != 'Darwin':
        # See https://gist.github.com/brwyatt/c21a888d79927cb476a4 for this Linux
        # version:
        cmd = 'find . -type f -printf "%C@ %p\n" | sort -rn | head -n 1 | cut -d" " -f2'
    else:
        # but we had to rewrite this as suggested at
        # https://unix.stackexchange.com/questions/272491/bash-error-find-printf-unknown-primary-or-operator
        # etc to work on MacOS.
        cmd = 'find . -type f -print0 | xargs -0r stat -f "%Fc %N" | sort -rn | head -n 1 | cut -d" " -f2'
    return os.popen(f'cd "{path}" && {cmd}').read().strip()


SUCCESSFUL_BUILD = ".successful-build"


def needs_build(package: str) -> bool:
    # Code below was hopelessly naive, e.g, a failed build would not get retried.
    # We only need to do a build if the newest file in the tree is not
    # in the dist directory.
    path = os.path.join(os.path.dirname(__file__), package)
    if not os.path.exists(os.path.join(path, 'dist')):
        return True
    newest = newest_file(path)
    return not newest.startswith('./' + SUCCESSFUL_BUILD)


def handle_path(s: str,
                path: Optional[str] = None,
                verbose: bool = True) -> None:
    desc = s
    if path is not None:
        os.chdir(path)
        desc += " # in '%s'" % path
    if verbose:
        print(desc)


def cmd(s: str,
        path: Optional[str] = None,
        verbose: bool = True,
        noerr=False) -> None:
    home: str = os.path.abspath(os.curdir)
    try:
        handle_path(s, path, verbose)
        n = os.system(s)
        if n == 2:
            raise KeyboardInterrupt
        if n:
            msg = f"Error executing '{s}'"
            if noerr:
                print(msg)
            else:
                raise RuntimeError(msg)
    finally:
        os.chdir(home)


def run(s: str, path: Optional[str] = None, verbose: bool = True) -> str:
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


def thread_map(callable: Callable,
               inputs: List[Any],
               nb_threads: int = 10) -> List:
    if len(inputs) == 0:
        return []
    if nb_threads == 1:
        return [callable(x) for x in inputs]
    from multiprocessing.pool import ThreadPool
    tp = ThreadPool(nb_threads)
    return tp.map(callable, inputs)


def all_packages() -> List[str]:
    # Compute all the packages.  Explicit order in some cases *does* matter as noted in comments,
    # but we use "tsc --build", which automatically builds deps if not built.
    v = [
        'packages/',  # top level workspace, e.g., typescript
        'packages/cdn',  # packages/hub assumes this is built
        'packages/util',
        'packages/sync',
        'packages/sync-client',
        'packages/conat',
        'packages/backend',
        'packages/api-client',
        'packages/jupyter',
        'packages/comm',
        'packages/project',
        'packages/assets',
        'packages/chat',
        'packages/ai',
        'packages/frontend',  # static depends on frontend; frontend depends on assets
        'packages/static',  # packages/hub assumes this is built (for webpack dev server)
        'packages/lite',
        'packages/project-runner',
        'packages/project-host',
        'packages/plus',
        'packages/launchpad',
        'packages/cloud',
        'packages/server',  # packages/next assumes this is built
        'packages/database',  # packages/next also assumes database is built (or at least the coffeescript in it is)
        'packages/project-proxy',
        'packages/file-server',
        'packages/next',
        'packages/hub',  # hub won't build if next isn't already built
        'packages/test'
    ]
    for x in os.listdir('packages'):
        path = os.path.join("packages", x)
        if path not in v and os.path.isdir(path) and os.path.exists(
                os.path.join(path, 'package.json')):
            v.append(path)
    return v


def packages(args) -> List[str]:
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


def package_json(package: str) -> dict:
    return json.loads(open(f'{package}/package.json').read())


def write_package_json(package: str, x: dict) -> None:
    open(f'{package}/package.json', 'w').write(json.dumps(x, indent=2))


def dependent_packages(package: str) -> List[str]:
    # Get a list of the packages
    # it depends on by reading package.json
    x = package_json(package)
    if "workspaces" not in x:
        # no workspaces
        return []
    v: List[str] = []
    for path in x["workspaces"]:
        # path is a relative path
        npath = os.path.normpath(os.path.join(package, path))
        if npath != package:
            v.append(npath)
    return v


def get_package_version(package: str) -> str:
    return package_json(package)["version"]


def get_package_npm_name(package: str) -> str:
    return package_json(package)["name"]


def update_dependent_versions(package: str) -> None:
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


def update_all_dependent_versions() -> None:
    for package in all_packages():
        update_dependent_versions(package)


def banner(s: str) -> None:
    print("\n" + "=" * 70)
    print("|| " + s)
    print("=" * 70 + "\n")


def install(args) -> None:
    v = packages(args)

    # The trick we use to build only a subset of the packages in a pnpm workspace
    # is to temporarily modify packages/pnpm-workspace.yaml to explicitly remove
    # the packages that we do NOT want to build.  This should be supported by
    # pnpm via the --filter option but I can't figure that out in a way that doesn't
    # break the global lockfile, so this is the hack we have for now.
    ws = "packages/pnpm-workspace.yaml"
    tmp = ws + ".tmp"
    allp = all_packages()
    try:
        if v != allp:
            shutil.copy(ws, tmp)
            s = open(ws, 'r').read() + '\n'
            for package in allp:
                if package not in v:
                    s += '  - "!%s"\n' % package.split('/')[-1]

            open(ws, 'w').write(s)

        print("install packages")
        # much faster special case
        # see https://github.com/pnpm/pnpm/issues/6778 for why we put that confirm option in
        # for the package-import-method, needed on zfs!, see https://github.com/pnpm/pnpm/issues/7024
        c = "cd packages && pnpm install --config.confirmModulesPurge=false --package-import-method=hardlink"
        if args.prod:
            args.dist_only = False
            args.node_modules_only = False
            args.parallel = True
            clean(args)
            c += " --prod"
        cmd(c)
    finally:
        if os.path.exists(tmp):
            shutil.move(tmp, ws)


def test(args) -> None:
    CUR = os.path.abspath('.')
    flaky = []
    fails = []
    success = []
    start = time.time()

    def status():
        print(
            "Status: ", {
                "fails": fails,
                "flaky": flaky,
                "success": success,
                "time": "%s minutes" % ((time.time() - start) / 60.0)
            })

    v = packages(args)
    v.sort()
    n = 0
    for path in v:
        n += 1
        package_path = os.path.join(CUR, path)
        if package_path.endswith('packages/'):
            continue
        package_json = open(os.path.join(package_path, 'package.json')).read()

        def f():
            print("\n" * 3)
            print("*" * 40)
            print("*")
            status()
            print(f"TESTING {n}/{len(v)}: {path}")
            print("*")
            print("*" * 40)
            if args.test_github_ci and 'test-github-ci' in package_json:
                test_cmd = "pnpm run test-github-ci"
            elif 'test:all' in package_json:
                test_cmd = "pnpm run --if-present test:all"
            else:
                test_cmd = "pnpm run --if-present test"
            if args.report:
                test_cmd += " --reporters=default --reporters=jest-junit"
            if args.max_workers:
                test_cmd += f' --maxWorkers={args.max_workers} '
            cmd(test_cmd, package_path)
            success.append(path)

        worked = False
        for i in range(args.retries + 1):
            try:
                f()
                worked = True
                break
            except KeyboardInterrupt:
                print("SIGINT -- ending test suite")
                status()
                return
            except Exception as err:
                print(err)
                flaky.append(path)
                print(f"ERROR testing {path}")
                if args.retries - i >= 1:
                    print(
                        f"Trying {path} again at most {args.retries - i} more times"
                    )
        if not worked:
            fails.append(path)

    status()
    if len(flaky) > 0:
        print("Flaky test suites:", flaky)

    if len(fails) == 0:
        print("ALL TESTS PASSED!")
    else:
        print("TESTS failed in the following packages -- ", fails)
        raise RuntimeError(f"Test Suite Failed {fails}")


# Build all the packages that need to be built.
def build(args) -> None:
    v = [package for package in packages(args) if needs_build(package)]
    CUR = os.path.abspath('.')

    def f(path: str) -> None:
        if not args.parallel and path != 'packages/static':
            # NOTE: in parallel mode we don't delete or there is no
            # hope of this working.
            dist = os.path.join(CUR, path, 'dist')
            if os.path.exists(dist):
                # clear dist/ dir
                shutil.rmtree(dist, ignore_errors=True)
        package_path = os.path.join(CUR, path)
        if not os.path.exists(package_path):
            # e.g., in some cases we delete packages entirely to speed
            # up the build
            return
        try:
            if args.dev and '"build-dev"' in open(
                    os.path.join(CUR, path, 'package.json')).read():
                cmd("pnpm run build-dev", package_path)
            else:
                cmd("pnpm run build", package_path)
        except Exception as err:
            if args.force:
                print(err)
            else:
                raise err
        # The build succeeded, so touch a file
        # to indicate this, so we won't build again
        # until something is newer than this file
        cmd("touch " + SUCCESSFUL_BUILD, package_path)

    if args.parallel:
        thread_map(f, v)
    else:
        thread_map(f, v, 1)


def tsc(args) -> None:
    v = packages(args)
    CUR = os.path.abspath('.')

    def f(path: str) -> None:
        package_path = os.path.join(CUR, path)
        if (path.endswith('next')):
            cmd("pnpm ts-build", package_path)
            return
        if (path.endswith('packages/') or path.endswith('next')):
            return
        if not os.path.exists(os.path.join(package_path, 'tsconfig.json')):
            return
        cmd("pnpm exec tsc --build", package_path)

    if args.parallel:
        thread_map(f, v)
    else:
        thread_map(f, v, 1)


def clean(args) -> None:
    v = packages(args)

    if args.dist_only:
        folders = ['dist']
    elif args.node_modules_only:
        folders = ['node_modules']
    else:
        folders = ['node_modules', 'dist', SUCCESSFUL_BUILD]

    paths = []
    for path in v:
        for x in folders:
            y = os.path.abspath(os.path.join(path, x))
            if os.path.exists(y):
                paths.append(y)

    def f(path):
        print("rm -rf '%s'" % path)
        if not os.path.exists(path):
            return
        if os.path.isfile(path):
            os.unlink(path)
            return
        shutil.rmtree(path, ignore_errors=True)
        if os.path.exists(path):
            shutil.rmtree(path, ignore_errors=True)
        if os.path.exists(path):
            raise RuntimeError(f'failed to delete {path}')

    if (len(paths) == 0):
        banner("No node_modules or dist directories")
    else:
        banner("Deleting " + ', '.join(paths))
        thread_map(f, paths + ['packages/node_modules'], nb_threads=10)

    if not args.node_modules_only:
        # remove TypeScript incremental build metadata so future builds don't
        # assume outputs exist when we've just deleted them.
        banner("Removing tsconfig.tsbuildinfo files...")

        def remove_tsbuildinfo(package_path: str) -> None:
            tsinfo = os.path.join(package_path, "tsconfig.tsbuildinfo")
            if os.path.exists(tsinfo):
                print(f"rm -f '{tsinfo}'")
                try:
                    os.unlink(tsinfo)
                except FileNotFoundError:
                    pass

        for package in v:
            remove_tsbuildinfo(os.path.abspath(package))

        banner("Running 'pnpm run clean' if it exists...")

        def g(path):
            # can only use --if-present with npm, but should be fine since clean is
            # usually just "rm".
            cmd("npm run clean --if-present", path)

        thread_map(g, [os.path.abspath(path) for path in v],
                   nb_threads=3 if args.parallel else 1)


def delete_package_lock(args) -> None:

    def f(path: str) -> None:
        p = os.path.join(path, 'package-lock.json')
        if os.path.exists(p):
            os.unlink(p)
        # See https://github.com/sagemathinc/cocalc/issues/6123
        # If we don't delete node_modules, then package-lock.json may blow up in size.
        node_modules = os.path.join(path, 'node_modules')
        if os.path.exists(node_modules):
            shutil.rmtree(node_modules, ignore_errors=True)

    thread_map(f, [os.path.abspath(path) for path in packages(args)],
               nb_threads=10)


def pnpm(args, noerr=False) -> None:
    v = packages(args)
    inputs: List[List[str]] = []
    for path in v:
        s = 'pnpm ' + ' '.join(['%s' % x for x in args.args])
        inputs.append([s, os.path.abspath(path)])

    def f(args) -> None:
        # kwds to make mypy happy
        kwds = {"noerr": noerr}
        cmd(*args, **kwds)

    if args.parallel:
        thread_map(f, inputs, 3)
    else:
        thread_map(f, inputs, 1)


def pnpm_noerror(args) -> None:
    pnpm(args, noerr=True)


def version_check(args):
    cmd("scripts/check_npm_packages.py")
    cmd("pnpm check-deps", './packages')


def node_version_check() -> None:
    version = int(os.popen('node --version').read().split('.')[0][1:])
    if version < 14:
        err = f"CoCalc requires node.js v14, but you're using node v{version}."
        if os.environ.get("COCALC_USERNAME",
                          '') == 'user' and 'COCALC_PROJECT_ID' in os.environ:
            err += '\nIf you are using https://cocalc.com, put ". /cocalc/nvm/nvm.sh" in ~/.bashrc\nto get an appropriate version of node.'
        raise RuntimeError(err)


def pnpm_version_check() -> None:
    """
    Check if the pnpm utility is new enough
    """
    version = os.popen('pnpm --version').read()
    if int(version.split('.')[0]) < 7:
        raise RuntimeError(
            f"CoCalc requires pnpm version 7, but you're using pnpm v{version}."
        )


def main() -> None:
    node_version_check()
    pnpm_version_check()

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

    subparser = subparsers.add_parser(
        'install', help='install node_modules deps for all packages')
    subparser.add_argument('--prod',
                           action="store_const",
                           const=True,
                           help='only install prod deps (not dev ones)')
    packages_arg(subparser)
    subparser.set_defaults(func=install)

    subparser = subparsers.add_parser(
        'build', help='build all packages for which something has changed')
    subparser.add_argument(
        '--dev',
        action="store_const",
        const=True,
        help="only build enough for development (saves time and space)")
    subparser.add_argument('--force',
                           action="store_const",
                           const=True,
                           help="ignore build errors")
    packages_arg(subparser)
    subparser.set_defaults(func=build)

    subparser = subparsers.add_parser(
        'tsc', help='run typescript once on all packages')
    packages_arg(subparser)
    subparser.set_defaults(func=tsc)

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

    subparser = subparsers.add_parser('pnpm',
                                      help='do "pnpm ..." in each package;')
    packages_arg(subparser)
    subparser.add_argument('args',
                           type=str,
                           nargs='*',
                           default='',
                           help='arguments to npm')
    subparser.set_defaults(func=pnpm)

    subparser = subparsers.add_parser(
        'pnpm-noerr',
        help=
        'like "pnpm" but suppresses errors; e.g., use for "pnpm-noerr audit fix"'
    )
    packages_arg(subparser)
    subparser.add_argument('args',
                           type=str,
                           nargs='*',
                           default='',
                           help='arguments to pnpm')
    subparser.set_defaults(func=pnpm_noerror)

    subparser = subparsers.add_parser(
        'version-check', help='version consistency checks across packages')
    subparser.set_defaults(func=version_check)

    subparser = subparsers.add_parser('test', help='test all packages')
    subparser.add_argument(
        "-r",
        "--retries",
        type=int,
        default=2,
        help=
        "how many times to retry a failed test suite before giving up; set to 0 to NOT retry"
    )
    subparser.add_argument(
        '--test-github-ci',
        const=True,
        action="store_const",
        help="run 'pnpm test-github-ci' if available instead of 'pnpm test'")
    subparser.add_argument('--report',
                           action="store_const",
                           const=True,
                           help='if given, generate test reports')
    subparser.add_argument(
        '--max-workers',
        type=str,
        default='',
        help=
        'optional maxWorkers argument to be passed to all all calls to pnpm test.  This can be helpful to prevent overly optimistic hyperthreading.'
    )
    packages_arg(subparser)
    subparser.set_defaults(func=test)

    args = parser.parse_args()
    if hasattr(args, 'func'):
        args.func(args)


if __name__ == '__main__':
    main()
