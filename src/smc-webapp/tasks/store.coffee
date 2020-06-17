#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
The Task Store
###

immutable = require('immutable')
{Store}   = require('../app-framework')
misc      = require('smc-util/misc')

class exports.TaskStore extends Store
    ###
    - tasks:   immutable map from task_id (uuidv4) to {desc:?, position:?, last_edited:?, due_date:?, task_id:?}
    - visible: ordered immutable js list of task_id's
    ###
    get_positions: =>
        v = []
        @get('tasks')?.forEach (task, id) =>
            v.push(task.get('position'))
            return
        v.sort(misc.cmp)  # cmp by <, > instead of string!
        return v



