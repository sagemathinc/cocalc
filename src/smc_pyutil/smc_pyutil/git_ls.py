#!/usr/bin/env python3

###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014--2015, SageMathCloud Authors
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

"""
A git-aware version of "ls -l", with JSON output

For each file, we compute the following information:

    * name: name of the file
    * isdir: true if it is a directory
    * size: size in bytes (if it is not a directory)
    * mtime: timestamp of file itself
    * commit: the *most recent* git commit related to this file; only
      given if file is under git control
         - author
         - date
         - message
         - sha
"""

import json
import os
import subprocess
import sys
import uuid


def getmtime(name):
    try:
        return os.lstat(name).st_mtime   # use lstat instead of stat or getmtime so this works on broken symlinks!
    except:
        # This should never happen, but we include this just in case
        # to avoid really buggy UI behavior.
        return 0


def getsize(name):
    try:
        return os.lstat(name).st_size  # same as above; use instead of os.path....
    except:
        return 0


def gitls(path, time, start, limit, hidden, directories_first, git_aware=True):
    if not os.path.exists(path):
        sys.stderr.write("error: no such path '%s'" % path)
        sys.exit(1)
    os.chdir(path)
    result = {}
    listdir = os.listdir('.')
    try:
        json.dumps(listdir)
    except:
        # Throw away filenames that can't be json'd, since they can't be JSON'd below, which would totally
        # lock user out of their project.
        listdir = []
        for x in os.listdir('.'):
            try:
                json.dumps(x)
                listdir.append(x)
            except:
                pass
    if not hidden:
        listdir = [x for x in listdir if not x.startswith('.')]
    if path.endswith('.snapshots') or path.endswith('.snapshots/'):
        all = [(x, getmtime(x)) for x in reversed(sorted(listdir)) if os.path.exists(x)]  # exists due to broken symlinks when snaps vanish
        files = dict([(name, {'name': name, 'mtime': mtime}) for name, mtime in all])
        sorted_names = [x[0] for x in all]
    elif time:
        # Get list of pairs (timestamp, name)
        all = sorted([(getmtime(name), name) for name in listdir])
        # Sort
        all.reverse()
        # Limit and convert to objects
        all = all[start:]
        if limit > 0 and len(all) > limit:
            result['more'] = True
            all = all[:limit]
        files = dict([(name, {'name': name, 'mtime': int(mtime)}) for mtime, name in all])
        sorted_names = [x[1] for x in all]
    else:
        # Get list of (name, timestamp) pairs
        all = sorted([(name, int(getmtime(name))) for name in listdir])
        # Sort
        # Limit and convert to objects
        all = all[start:]
        if limit > 0 and len(all) > limit:
            result['more'] = True
            all = all[:limit]
        files = dict([(name, {'name': name, 'mtime': mtime}) for name, mtime in all])
        sorted_names = [x[0] for x in all]

    # Fill in other OS information about each file
    # for obj in result:
    for name, info in files.items():
        if os.path.isdir(name):
            info['isdir'] = True
        else:
            info['size'] = getsize(name)

    # Fill in git-related information about each file
    if git_aware:
        # First, obtain git history about files
        format = "--pretty=format:!%H|%an <%ae>|%ad|%s|"
        field_sep = str(uuid.uuid4())
        commit_sep = str(uuid.uuid4())
        format = format.replace('|', field_sep).replace("!", commit_sep)
        # Why 200 below: in tests, if there are tons of files, passing
        # them all on the command line ends up taking longer than just
        # getting info about everything in this tree
        if len(files) > 200:
            git_path = ['.']
        else:
            git_path = [name for name, info in files.items() if not info.get('isdir', False)]
        log = subprocess.Popen(['git', 'log', '--date=raw', '--name-status', format] + git_path,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE).stdout.read()
        v = {}
        for entry in log.split(commit_sep):
            if len(entry.strip()) == 0:
                continue
            sha, author, date, message, modified_files = entry.split(field_sep)
            date = int(date.split()[0])
            # modified_files = set of filenames
            modified_files = [os.path.split(str(x[2:]).replace('\\\\"', '"').replace('\\"', ''))[-1] for x in modified_files.splitlines() if x]
            for name in modified_files:
                if name in files and 'commit' not in files[name]:
                    files[name]['commit'] = {'author': author, 'date': date, 'message': message, 'sha': sha}

    # Make ordered list of files, with directories first.
    if directories_first:
        result['files'] = ([files[name] for name in sorted_names if files[name].get('isdir', False)] +
                           [files[name] for name in sorted_names if not files[name].get('isdir', False)])
    else:
        result['files'] = [files[name] for name in sorted_names]
    return result


def main():
    import argparse
    parser = argparse.ArgumentParser(description="git-ls -- like ls, but git *aware*, and JSON output; files not under git are still included.")
    parser.add_argument('--time', help='order by time instead of alphabetical order (default: False)', action='store_true')
    parser.add_argument('--start', help='starting file number', default=0)
    parser.add_argument('--limit', help='maximum number of files', default=0)  # 0 = no limit
    parser.add_argument('--git', help="actually be git aware (not the default)", action="store_true")
    parser.add_argument('--hidden', help="include files/directories that start with a dot", action="store_true")
    parser.add_argument('--directories_first', help="sort by putting directories first, then files (default: False)", action="store_true")
    parser.add_argument('path', nargs='?', help='return info about all files in this path', default='.')
    args = parser.parse_args()
    if isinstance(args.path, list):
        args.path = args.path[0]

    if os.path.abspath(args.path) == os.path.join(os.environ['HOME'], '.snapshots'):
        # When getting a listing for the .snapshots directory, update it to show the latest version.
        from .update_snapshots import update_snapshots
        update_snapshots()

    r = gitls(path=args.path, time=args.time, start=int(args.start), limit=int(args.limit),
              hidden=args.hidden, directories_first=args.directories_first, git_aware=args.git)
    print(json.dumps(r, separators=(',', ':')))

if __name__ == "__main__":
    main()
