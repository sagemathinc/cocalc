#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Misc configuration functions.
###

os_path = require('path')

# Where projects are stored.
exports.project_path = ->
    return process.env.COCALC_PROJECT_PATH ? os_path.join(process.env.SALVUS_ROOT, 'data', 'projects')
