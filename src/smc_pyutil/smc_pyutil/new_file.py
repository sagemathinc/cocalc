#!/usr/bin/python

import os, platform, shutil, sys

PLATFORM = platform.system().lower()

def new_file(path):
    if os.path.exists(path):
        # nothing to do.
        return

    base, filename = os.path.split(path)

    if base and not os.path.exists(base):
        os.makedirs(base)

    ext = os.path.splitext(path)[1].lower()
    for places in [os.environ['HOME'], os.path.dirname(os.path.realpath(__file__))]:
        template = os.path.join(places, 'templates', PLATFORM, 'default' + ext)
        if os.path.exists(template):
            shutil.copyfile(template, path)
            return

    # No template found
    open(path,'w').close()

def main():
    if len(sys.argv) == 1:
        print """
    This script is called like so:

         %s  path/to/file.tex  another/path/to/a/file.tex  ....

    If path/to/file.tex already exists, nothing happens.
    If path/to/file.tex does not exist, it is created (including the directory that contains it),
    and if there is a file $HOME/templates/default.tex or /projects/templates/[platform]/default.tex (for tex extension),
    then that template file is set to the initial contents. """%(sys.argv[0])
        sys.exit(1)


    for x in sys.argv[1:]:
        new_file(x)

if __name__ == "__main__":
    main()



