#!/usr/bin/env python
"""
Manage compiling a .tex file via LaTeX.

In particular, avoid running several compilation steps at the same time.
"""
import os, json, time, argparse
import pid # https://pypi.python.org/pypi/pid
import psutil

def latexmk(filename):
    """
    Fully managed latexmk + sagetex run
    """
    print "Running latexmk on %s" % filename
    os.system("latexmk -pdf -bibtex -synctex=1 -interaction=nonstopmode '%s'" % filename)

def run_latex(filename, command):
    if command is None:
        latexmk(filename)

def run(filename, command):
    """
    There is a bad situation, when processing the Latex file takes longer, than the client requests renderings.
    This is in particular the case, when sagetex processing takes more time.
    Here, a pid lock file is used to limit the number of concurrently running jobs to 1 and kill ongoing ones.
    It only retries once!
    (Without that, additional latex/sagetex jobs would pile up in the background)
    """
    # lock is based on the target latex file and project id
    project_id = json.load(open(os.path.expanduser('~/.smc/info.json'))).get('project_id', '')
    pidfn = '%s-%s' % (project_id, filename.replace('/', '-')
    lock = pid.PidFile(pidname = pidfn, force_tmpdir=True)

    def try_again():
        proc = psutil.Process(int(open(lock.filename).read()))
        if proc.is_running():
            proc.kill()
        # 2nd try
        time.sleep(.2)
        try:
            with lock:
                run_latex(filename, command)
        # race condition, ignored
        except pid.PidFileAlreadyLockedError as piderr:
            pass
        except pid.PidFileAlreadyRunningError as piderr:
            pass

    try:
        with lock:
            run_latex(filename, command)
    except pid.PidFileAlreadyLockedError as piderr:
        try_again(piderr)
    except pid.PidFileAlreadyRunningError as piderr:
        try_again(piderr)

def main():
    parser = argparse.ArgumentParser(description='Compile a given Latex file')
    parser.add_argument("filename", help="name of tex file (required)", type=str)
    parser.add_argument("command", help="optionally, the specific command to run (otherwise, it will be latexmk)", type=str)
    args = parser.parse_args()
    run(args.filename, args.command)

if __name__ == '__main__':
    main()