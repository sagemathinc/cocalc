#!/usr/bin/env python3

import os, sys

def migrate_project(project_id, quota):
    path = '/projects/' + project_id
    if not os.path.exists(path):
        # TODO: or maybe we make it empty?
        raise RuntimeError("no path "+path)
    

if __name__ == "__main__":
    project_id = sys.argv[1]
    quota = sys.argv[2] if len(sys.argv) >= 3 else 3000
    migrate_project(project_id, quota)

