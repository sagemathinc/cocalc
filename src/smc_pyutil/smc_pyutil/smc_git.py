#!/usr/bin/python
"""
(c) Tim Clemans, 2016
"""

import json, os, subprocess, sys, uuid

def remotes():
    results = os.popen('git remote -v').read().strip('\n').split('\n')
    results = [row.replace(' ','\t').split('\t')[:2] for row in results]
    results = dict(results)
    return json.dumps(results)

def current_branch():
    result = os.popen('git rev-parse --abbrev-ref HEAD 2> /dev/null || echo "master" ').read().strip('\n').split('\n')[-1]
    return result.strip()

def branches():
    results = os.popen('git branch').read().strip('\n').split('\n')
    results = [item.strip() for item in results if not item.startswith('*')]
    results = sorted(results)
    return json.dumps(results)

def changed_tracked_files():
    results = os.popen('git diff --name-only').read().strip('\n').split('\n')
    return json.dumps(results)

def changed_untracked_files():
    results = os.popen('git ls-files . --exclude-standard --others').read().strip('\n').split('\n')
    return json.dumps(results)

def compare_current_branch_with_upstream_master():
    results = os.popen('git diff %s upstream/master' % (current_branch())).read()
    return results

def create_branch_and_reset_to_upstream_master(branch_name):
    os.system('git checkout -b %s' % (branch_name))
    os.system('git fetch upstream; git reset --hard upstream/master')
    return ''

def push_to_origin_same_branch():
    os.system('git push origin %s' % (current_branch()))
    return ''

def pull_upstream_master():
    os.system('git pull --no-edit upstream master')
    return ''

def set_github_login(data_file, username, access_token):
    with open(data_file, 'w') as f:
        f.write(json.dumps({'github_username': username, 'github_access_token': access_token}))
    return ''

def get_data_file_contents(data_file):
    with open(data_file, 'r') as f:
        return f.read()

def main():
    import sys
    #import argparse
    #parser = argparse.ArgumentParser()
    #parser.add_argument('command')
    #args = parser.parse_args()
    if sys.argv[1] == 'create_branch_and_reset_to_upstream_master':
        print create_branch_and_reset_to_upstream_master(sys.argv[2])
    elif sys.argv[1] == 'set_github_login':
        print set_github_login(sys.argv[2], sys.argv[3], sys.argv[4])
    elif sys.argv[1] == 'get_data_file_contents':
        print get_data_file_contents(sys.argv[2])
    else:
        print globals()[sys.argv[1]]()

if __name__ == "__main__":
    main()

