###
The Task Store
###

immutable         = require('immutable')
{Store}           = require('../smc-react')

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
        v.sort()
        return v

