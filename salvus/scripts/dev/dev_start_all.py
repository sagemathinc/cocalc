#!/home/salvus/salvus/salvus/data/local/bin/python

import os, sys

os.environ['USER'] = 'salvus'  # needed when running this script from crontab
if "SALVUS_ROOT" not in os.environ:
    os.environ['SALVUS_ROOT']='/home/salvus/salvus/salvus/'
SALVUS_ROOT=os.environ['SALVUS_ROOT']
os.chdir(SALVUS_ROOT)
sys.path.append(SALVUS_ROOT)

import admin
a = admin.Services('conf/deploy_devel/', password='')

a.start('all')

os.system("compute start")

print "-"*70
print "Logs at ~/logs"
print
print "       https://%s"%os.popen("gce-external-ip").read()
print
print "-"*70

