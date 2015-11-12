#!/usr/bin/env python
import util

import os; os.environ['DEVEL']='yes'

util.chdir()

util.cmd('./update_schema.coffee')

util.cmd('service_hub.py --hostname=localhost --foreground start')
