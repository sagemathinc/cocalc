#!/usr/bin/python
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details

MAX_FILES = 100

import json, os, sys

home = os.environ['HOME']

if 'TMUX' in os.environ:
    prefix = '\x1bPtmux;\x1b'
    postfix = '\x1b\\'
else:
    prefix = ''
    postfix = ''


def process(paths):
    v = []
    if len(paths) > MAX_FILES:
        sys.stderr.write(
            "You may close at most %s at once using the open command; truncating list\n"
            % MAX_FILES)
        paths = paths[:MAX_FILES]
    for path in paths:
        if not path:
            continue
        if not os.path.exists(path) and any(c in path for c in '{?*'):
            # If the path doesn't exist and does contain a shell glob character which didn't get expanded,
            # then don't try to just create that file.  See https://github.com/sagemathinc/cocalc/issues/1019
            sys.stderr.write("no match for '%s', so not closing\n" % path)
            continue
        if not os.path.exists(path):
            # Doesn't exist, so doesn't matter
            continue

        if not path.startswith('/'):
            # we use pwd instead of getcwd or os.path.abspath since we want this to
            # work when used inside a directory that is a symlink!  I could find
            # no analogue of pwd directly in Python (getcwd is not it!).
            path = os.path.join(os.popen('pwd').read().strip(), path)

        # determine name relative to home directory
        if path.startswith(home):
            name = path[len(home) + 1:]
        else:
            name = path

        # Is it a file or directory?
        if os.path.isdir(path):
            v.append({'directory': name})
        else:
            v.append({'file': name})

    if v:
        mesg = {'event': 'close', 'paths': v}
        print(prefix +
              '\x1b]49;%s\x07' % json.dumps(mesg, separators=(',', ':')) +
              postfix)


def main():
    if len(sys.argv) == 1:
        print("Usage: close [path names] ...")
        print(
            "Closes each file (or directory) in the CoCalc web-based editor from the shell."
        )
        print("If the named file doesn't exist, it is created.")
    else:
        process(sys.argv[1:])


if __name__ == "__main__":
    main()
