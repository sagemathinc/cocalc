#!/usr/bin/python

# Maximum number of files that user can open at once using the open command.
# This is here to avoid the user opening 100 files at once (say)
# via "open *" and killing their frontend.
from __future__ import absolute_import
from __future__ import print_function

MAX_FILES = 15

# ROOT_SYMLINK is a symlink to / from somehow in the user's home directory.
# This symlink should get created as part  of project startup, so that we can
# treat all paths in the file system as being contained in the user's home direoctory.
# This may be dumb but simplifies our code and is assumed in some places.
#     ~$ ls -ls .smc/root
#      0 lrwxrwxrwx 1 user user 1 Oct 22 23:00 .smc/root -> /
ROOT_SYMLINK = '.smc/root'

import os, sys, json, time, uuid

home = os.environ['HOME']


def process(paths):
    v = []
    if len(paths) > MAX_FILES:
        sys.stderr.write(
            "You may open at most %s at once using the open command; truncating list\n"
            % MAX_FILES)
        paths = paths[:MAX_FILES]
    for path in paths:
        if not path:
            continue
        if not os.path.exists(path) and any(c in path for c in '{?*'):
            # If the path doesn't exist and does contain a shell glob character which didn't get expanded,
            # then don't try to just create that file.  See https://github.com/sagemathinc/cocalc/issues/1019
            sys.stderr.write("no match for '%s', so not creating\n" % path)
            continue
        if not os.path.exists(path):
            if '/' in path:
                dir = os.path.dirname(path)
                if not os.path.exists(dir):
                    sys.stderr.write("creating directory '%s'\n" % dir)
                    os.makedirs(dir)
            if path[-1] != '/':
                sys.stderr.write("creating file '%s'\n" % path)
                from . import new_file
                new_file.new_file(
                    path
                )  # see https://github.com/sagemathinc/cocalc/issues/1476

        if not path.startswith('/'):
            # we use pwd instead of getcwd or os.path.abspath since we want this to
            # work when used inside a directory that is a symlink!  I could find
            # no analogue of pwd directly in Python (getcwd is not it!).
            path = os.path.join(os.popen('pwd').read().strip(), path)

        # Make name be the path to the file, **relative to home directory**
        if path.startswith(home):
            name = path[len(home) + 1:]
        else:
            # use the / symlink -- see https://github.com/sagemathinc/cocalc/issues/4188
            name = ROOT_SYMLINK + path

        # Is it a file or directory?
        if os.path.isdir(path):
            v.append({'directory': name})
        else:
            v.append({'file': name})

    if v:
        mesg = {'event': 'open', 'paths': v}
        write_mesg(mesg)


def write_mesg(msg: dict) -> None:
    dirpath = os.environ.get("COCALC_CONTROL_DIR")
    if not dirpath:
        print("COCALC_CONTROL_DIR not set", file=sys.stderr)
        sys.exit(2)
    os.makedirs(dirpath, exist_ok=True)
    base = f"{int(time.monotonic_ns())}-{os.getpid()}-{uuid.uuid4().hex[:8]}.json"
    tmp = os.path.join(dirpath, "." + base + ".tmp")
    dst = os.path.join(dirpath, base)
    data = (json.dumps(msg, separators=(",", ":")) + "\n").encode()

    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())  # ensure file data is durable
        os.replace(tmp, dst)  # atomic rename into place
        # (Optional) fsync the directory for crash-safety:
        dfd = os.open(dirpath, os.O_DIRECTORY)
        try:
            os.fsync(dfd)
        finally:
            os.close(dfd)
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except FileNotFoundError:
                pass


def main():
    if len(sys.argv) == 1:
        print("Usage: open [path names] ...")
        print(
            "Opens each file (or directory) in the CoCalc web-based editor from the shell."
        )
        print("If the named file doesn't exist, it is created.")
    else:
        process(sys.argv[1:])


if __name__ == "__main__":
    main()
