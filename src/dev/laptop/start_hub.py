#!/usr/bin/env python
import util

import os; os.environ['DEVEL']='yes'

util.chdir()

util.cmd('service_hub.py --dev --hostname=localhost --foreground start')
