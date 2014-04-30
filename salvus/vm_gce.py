#!/usr/bin/env python
"""
vm_gce.py -- create and run a virtual machines on Google Compute Engine based on the standard
         salvus_base template with the given memory and vcpus, and add
         the vm to our tinc VPN infrastructure.  There is also a destroy option that
         destroys the vm.
"""

#######################################################################
# Copyright (c) William Stein, 2014.  Not open source or free.
#######################################################################

import logging, os, shutil, socket, tempfile, time

from admin import run
import admin

sh = admin.SH(maxtime=600)

