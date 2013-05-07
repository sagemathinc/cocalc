#!/usr/bin/env python

import argparse, os, sys, time 
VM_PATH = os.path.join(os.environ['HOME'], 'vm/images/base/')

def cmd(s):
    print s
    if os.system(s):
        raise RuntimeError("error executing '%s'"%s)

cmd("ls -lth %s|head -5"%VM_PATH)
                                                                                                                                        
parser = argparse.ArgumentParser(description="Create a new VM image.")                                                         
parser.add_argument("--prev", dest="prev", type=str, help="previous vm image name", default="")
parser.add_argument("--next", dest="next",  type=str, help="new vm image name", default="")                                     
args = parser.parse_args()                                                                                                              

prev = args.prev
next = args.next

if prev == "":
   # make it the most recent image
   prev = os.popen("ls -1t ~/vm/images/base/*.img|head -1").read().strip().rstrip('.img')

if next == "":
   # make image name salvus-date   
   next = time.strftime("salvus-%Y-%m-%d")


defined_machines = os.popen("virsh_list").read()

for machine in [prev, next]:
    if machine in defined_machines:
        print "%s is currently defined.  Please undefine it before proceeding further, in order to avoid any possible corruption."%machine
        sys.exit(1)

prev_path = os.path.join(VM_PATH, prev + '.img')
next_path = os.path.join(VM_PATH, next + '.img')

if not os.path.exists(prev_path):
    raise ValueError("previous vm image doesn't exist -- " + prev_path)

if os.path.exists(next_path):
    raise ValueError("next vm image already exists -- " + next_path)

cmd("qemu-img create -b %s -f qcow2 %s"%(prev_path, next_path))

cmd("virt-install --cpu host --network user,model=virtio --name %s --vcpus=16 --ram 32768 --import --disk %s,device=disk,bus=virtio,format=qcow2,cache=writeback --noautoconsole"%(next,next_path))

cmd("virsh -c qemu:///session qemu-monitor-command --hmp %s 'hostfwd_add ::2222-:22'"%next)

print "To connect, do\n\t\t ssh localhost -p 2222"

print """
You probably want to do something like this:

    cd salvus/salvus
    . salvus-env
    git pull
    ./make_coffee
    # fix /etc/ssh/ssh_config
    sudo su
    apt-get update; apt-get upgrade
    reboot -h now
    sudo shutdown -h now

 Then

    virsh_undefine %s 
    cd vm/images/base/
    ./push

"""%next
