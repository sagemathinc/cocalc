#!/usr/bin/python

# rmd2html.py - used by rmd edit mode

import os, sys, subprocess, errno, re

def rmd2html(path):
    if not os.path.exists(path):
        raise IOError(errno.ENOENT, os.strerror(errno.ENOENT), path)

    (root, ext) = os.path.splitext(path)
    if ext.lower() != ".java":
        raise ValueError('Rmd input file required, got {}'.format(path))
    
    with open(path, 'r') as f:
        s = f.read()
    name = re.search('public class (?P<name>[a-zA-Z0-9]+)', s)
    if name:
        name = name.group('name')
    else:
        print 'error public class name not found'
        return
    try:
        open(name +'.java','w').write(s.encode("UTF-8"))
        (child_stdin, child_stdout, child_stderr) = os.popen3('javac %s'%path)
        err = child_stderr.read()
        sys.stdout.write(child_stdout.read())
        sys.stderr.write(err)
        sys.stdout.flush()
        sys.stderr.flush()
        if not os.path.exists(name+'.class'): # failed to produce executable
            return
        (child_stdin, child_stdout, child_stderr) = os.popen3('java %s'%name)
        output = child_stdout.read()
        with open(path[:-4]+'html', 'w') as f:
            f.write(output.replace('\n', '<br/>'))
        sys.stderr.write('\n'+child_stderr.read())
        sys.stdout.flush()
        sys.stderr.flush()
        with open(path[:-4]+'html', 'r') as htmlfile:
            print(htmlfile.read())
    finally:
        pass

def main():
    if len(sys.argv) != 2:
        raise ValueError('Usage: {} path/to/file.java'.format(sys.argv[0]))

    rmd2html(sys.argv[1])

if __name__ == "__main__":
    main()



