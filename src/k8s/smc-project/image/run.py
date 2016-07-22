#!/usr/bin/env python
import os, shutil
from subprocess import call

project_id = os.environ['SMC_PROJECT_ID']

if not os.path.exists('/projects'):
    os.makedirs('/projects')

# fix permissions -- it's octal (!) and in Py3 it would be 0o711
os.chmod('/projects', 0711)

project_path = '/projects/' + project_id

call(['/usr/local/bin/smc-compute', 'create_user', project_id])

# We take the sha-512 of the uuid just to make it harder to force a collision.  Thus even if a
# user could somehow generate an account id of their choosing, this wouldn't help them get the
# same uid as another user.
# 2^31-1=max uid which works with FUSE and node (and Linux, which goes up to 2^32-2).
import hashlib
n = int(hashlib.sha512(project_id).hexdigest()[:8], 16)  # up to 2^32
n //= 2  # up to 2^31   (floor div so will work with python3 too)
uid = n if n>65537 else n+65537   # 65534 used by linux for user sync, etc.

os.chown(project_path, uid, uid)

os.setgid(uid)
os.setuid(uid)
os.environ['HOME'] = project_path
os.environ['SMC']  = os.path.join(project_path, '.smc')

username = project_id.replace('-','')
os.environ['USER'] = os.environ['USERNAME'] =  os.environ['LOGNAME'] = username
os.environ['MAIL'] = '/var/mail/%s'%username

os.chdir(project_path)
# optional args: tcp port and raw port
call("smc-start --tcp_port 6000 --raw_port 6001".split())
call('tail -f .smc/local_hub/local_hub.log', shell=True)


