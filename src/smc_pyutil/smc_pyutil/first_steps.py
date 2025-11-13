# This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
# License: MS-RSL – see LICENSE.md for details

import os, shutil

def main():
    path = os.path.join(os.environ['HOME'], 'first-steps')
    if os.path.exists(path):
        # nothing to do.
        return

    ext = os.path.splitext(path)[1].lower()
    template = os.path.join(os.path.dirname(os.path.realpath(__file__)),
                            'templates', 'first-steps')
    if os.path.exists(template):
        shutil.copytree(template, path)
        return

    # No template found. Installation must be messed up badly.
    raise RuntimeError("first steps template is not available")


if __name__ == "__main__":
    main()
