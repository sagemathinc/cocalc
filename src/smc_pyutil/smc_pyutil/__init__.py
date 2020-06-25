# -*- coding: utf-8 -*-

# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details

# All our code in this modules assumes that an environment variable SMC exists
# and that the directory is points to also exists.   We make it ~/.smc by default.

from __future__ import absolute_import
import os
if not 'SMC' in os.environ:
    os.environ['SMC'] = os.path.join(os.environ['HOME'], '.smc')

if not os.path.exists(os.environ['SMC']):
    os.makedirs(os.environ['SMC'])
