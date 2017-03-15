###
Jupyter Notebook

CoCalc: Collaborative web-based calculation
Copyright (C) 2017, Sagemath Inc.

AGPLv3
###

require('coffee-cache').setCacheDir("#{process.env.HOME}/.coffee/cache")

misc = require('smc-util/misc')
{redux} = require('../../smc-react')

exports.setup = (cb) ->
    project_id = '197cebae-6410-469a-8299-54498e438f51'
    path = 'path.ipynb'
    actions = new (require('../actions').JupyterActions)('name', redux)
    store   = new (require('../store').JupyterStore)('name', redux)
    actions.store = store
    actions._init(project_id, path)
    salvus_client = new (require('smc-util/client-test').Client)()
    global.salvus_client = salvus_client

    syncdb = salvus_client.sync_db
        project_id      : project_id
        path            : misc.meta_file(path, 'cocalc')  # TODO
        change_throttle : 0
        save_interval   : 0
        primary_keys    : ['type', 'id']
        string_cols     : ['input']
        cursors         : true

    actions.syncdb = syncdb
    store.syncdb   = syncdb


    syncdb.once 'init', (err) =>
        if err
            cb(err)
        else
            syncdb.on('change', actions._syncdb_change)
            actions._syncdb_change()
            cb(undefined, actions)

    # Cause the syncstring to be initialized so that the above 'init' happens.
    salvus_client.user_query
        query :
            syncstrings :
                project_id : project_id
                path       : misc.meta_file(path, 'cocalc')
                init       : {time: new Date()}

exports.teardown = (cb) ->
    redux.getActions('name')?.close()
    redux.constructor()  # this instantly resets the state
    cb()
