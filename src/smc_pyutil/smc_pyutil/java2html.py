#!/usr/bin/python

# java2html.py - used by java edit mode

import os, sys, subprocess, errno, re

def java2html(path):
    if not os.path.exists(path):
        raise IOError(errno.ENOENT, os.strerror(errno.ENOENT), path)

    (root, ext) = os.path.splitext(path)
    if ext.lower() != ".java":
        raise ValueError('Java input file required, got {}'.format(path))
    
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
        output = child_stderr.read()
        output += '\n' + child_stdout.read()
        sys.stdout.flush()
        sys.stderr.flush()
        if not os.path.exists(path[:-5]+'.class'): # failed to produce executable
            return
        (child_stdin, child_stdout, child_stderr) = os.popen3('java %s' % path[:-5])
        output += '\n' + child_stdout.read()
        output += '\n' + child_stderr.read()
        sys.stdout.flush()
        sys.stderr.flush()
        print(output.replace('\n', '<br/>'))
    finally:
        pass

def main():
    if len(sys.argv) != 2:
        raise ValueError('Usage: {} path/to/file.java'.format(sys.argv[0]))

    java2html(sys.argv[1])

if __name__ == "__main__":
    main()



