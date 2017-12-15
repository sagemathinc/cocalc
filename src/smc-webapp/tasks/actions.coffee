###
Task Actions
###

{Actions}  = require('../smc-react')

class exports.TaskActions extends Actions
    _init: (project_id, path, syncdb, store, client) =>
        @syncdb = syncdb
        @syncdb.on('change', @_syncdb_change)

    _syncdb_change: (changes) =>
        console.log 'change', changes

    save: =>
        @syncdb.save () =>
            @set_save_status()
        @set_save_status()

    set_save_status: =>
        # TODO