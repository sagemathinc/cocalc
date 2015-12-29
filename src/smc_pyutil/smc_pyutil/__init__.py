# All our code in this modules assumes that an environment variable SMC exists
# and that the directory is points to also exists.   We make it ~/.smc by default.

import os
if not 'SMC' in os.environ:
    os.environ['SMC'] = os.path.join(os.environ['HOME'], '.smc')

if not os.path.exists(os.environ['SMC']):
    os.makedirs(os.environ['SMC'])
