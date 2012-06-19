"""
Blocking code that is used by the backend.
"""

import argparse, sys

def init_worker(username, hostname, path):
    import json, subprocess  # late import to improve startup time of this module.
    
    # 1. Get configuration of worker by using ssh to cat the file
    #          user:path/conf.json to stdout.

    args = ['ssh', '%s@%s'%(username, hostname), 'cat %s/conf.json'%path]
    p = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.wait():
        sys.stderr.write(p.stderr.read())
        sys.exit(1)

    # 2. Parse json configuration.
    data = p.stdout.read()
    conf = json.loads(data)
    print conf

    # 3. Store everything about worker in database.
    import backend_database as db
    s = db.session()
    # - ensure that the worker is not in db already; if it is there, drop it.
    for w in s.query(db.Worker).filter(db.Worker.hostname==hostname and db.Worker.username==username and db.Worker.path==path):
        s.delete(w)

    # - add the worker
    worker = db.Worker(username=username, hostname=hostname, path=path)
    if 'limits' in conf:
        for key, value in conf['limits'].iteritems():
            setattr(worker, key, value)

    s.add(worker)
    s.commit()

    # - add the accounts that will run actual work
    for name in conf['accounts']:
        worker.accounts.append(db.WorkerAccount(name))
    s.commit()
        
    # 4. scp newest worker.py file over
    import os
    base = os.path.dirname(os.path.realpath(__file__))
    args = ['scp', os.path.join(base, 'worker.py'), '%s@%s:%s/'%(username, hostname, path)]
    print args
    p = subprocess.Popen(args)
    if p.wait():
        sys.stderr.write("Error copying over new worker.py file")

    # 5. initialize workers
    args = ['ssh', '%s@%s'%(username, hostname), 'python %s/worker.py --reset_all_accounts --conf=%s/conf.json'%(path, path)]
    print args
    if subprocess.Popen(args).wait():
        sys.stderr.write("Error initializing workers.")
        

#############################################################
# Command line interface
#############################################################

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Run or stop a backend server instance")

    parser.add_argument('--path', dest='path', type=str, default='.',
                        help="a path (used by various functions)")
    parser.add_argument('--username', dest='username', type=str, default='',
                        help="a username (used by various functions)")
    parser.add_argument('--hostname', dest='hostname', type=str, default='',
                        help="a hostname (used by various functions)")
    
    parser.add_argument('--init_worker', dest='init_worker', action="store_const", const=True, default=False,
                        help="initialize the worker machine using the account username@hostname with configuration in path/")

    args = parser.parse_args()

    if args.init_worker:
        init_worker(username=args.username, hostname=args.hostname, path=args.path)
        sys.exit(0)
        
