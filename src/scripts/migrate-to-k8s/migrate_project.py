#!/usr/bin/env python3

import os, shutil, subprocess, sys, time

def run(v, shell=False, path='.', get_output=False, env=None, verbose=1):
    t = time.time()
    if isinstance(v, str):
        cmd = v
        shell = True
    else:
        cmd = ' '.join([(x if len(x.split())<=1 else '"%s"'%x) for x in v])
    if path != '.':
        cur = os.path.abspath(os.curdir)
        if verbose:
            print('chdir %s'%path)
        os.chdir(path)
    try:
        if verbose:
            print(cmd)
        if shell:
            kwds = {'shell':True, 'executable':'/bin/bash', 'env':env}
        else:
            kwds = {'env':env}
        if get_output:
            output = subprocess.Popen(v, stdout=subprocess.PIPE, **kwds).stdout.read().decode()
        else:
            if subprocess.call(v, **kwds):
                raise RuntimeError("error running '{cmd}'".format(cmd=cmd))
            output = None
        seconds = time.time() - t
        if verbose > 1:
            print("TOTAL TIME: {seconds} seconds -- to run '{cmd}'".format(seconds=seconds, cmd=cmd))
        return output
    finally:
        if path != '.':
            os.chdir(cur)

def migrate_project(project_id, size):
    src = '/projects/' + project_id
    if not os.path.exists(src):
        # TODO: or maybe we make it empty?
        raise RuntimeError("no source path "+src)

    path = os.path.join(os.path.abspath('.'), 'tmp', project_id)
    try:
        os.makedirs(path)
        # create zpool image file of appropriate size, with compression and dedup
        pool_file = os.path.join(path, 'pool')
        image = os.path.join(path, "00.img")
        run('truncate -s %s %s'%(size, image))
        pool = 'pool-' + project_id
        open(pool_file,'w').write(pool)
        run("sudo zpool create %s -f %s"%(pool, image))
        run("sudo zfs set compression=lz4 %s"%pool)
        run("sudo zfs set dedup=on %s"%pool)


    finally:
        #shutil.rmtree(path)
        pass


if __name__ == "__main__":
    project_id = sys.argv[1]
    quota = sys.argv[2] if len(sys.argv) >= 3 else '3G'
    migrate_project(project_id, quota)

