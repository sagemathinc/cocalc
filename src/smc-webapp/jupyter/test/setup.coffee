###
Jupyter Notebook

CoCalc: Collaborative web-based calculation
Copyright (C) 2017, Sagemath Inc.

AGPLv3
###

require('coffee-cache')

immutable = require('immutable')
expect    = require('expect')

misc = require('smc-util/misc')

setup = (cb) ->
    project_id = '197cebae-6410-469a-8299-54498e438f51'
    path = 'path.ipynb'
    {redux} = require('../../smc-react')
    actions = new (require('../actions').JupyterActions)('name', redux)
    store   = new (require('../store').JupyterStore)('name', redux)
    actions.store = store
    actions._init(project_id, path)
    salvus_client = new (require('smc-util/client-test').Client)()

    syncdb = salvus_client.sync_db
        project_id      : project_id
        path            : misc.meta_file(path, 'cocalc')  # TODO
        change_throttle : 0
        save_interval   : 0
        primary_keys    : ['type', 'id']
        string_cols     : ['input']

    actions.syncdb = syncdb

    syncdb.once 'init', (err) =>
        if err
            cb(err)
        else
            syncdb.on('change', actions._syncdb_change)
            actions._syncdb_change()
            cb(undefined, {actions:actions, store:store})

    # Cause the syncstring to be initialized so that the above 'init' happens.
    salvus_client.user_query
        query :
            syncstrings :
                project_id : project_id
                path       : misc.meta_file(path, 'cocalc')
                init       : {time: new Date()}

describe 'tests the setup code -- ', ->

    actions = store = undefined

    it 'initializes things', (done) ->
        setup (err, x) ->
            if err
                done(err)
            else
                {actions, store} = x
                done()

    it 'sets something in the store', ->
        actions.setState(test:'value')
        expect(store.get('test')).toBe('value')

    it 'checks the mode got set', ->
        expect(store.get('mode')).toBe('escape')

    it 'checks there is exactly one cell', ->
        expect(store.get('cells').size).toBe(1)

    it 'checks that cell_list has size 1', ->
        expect(store.get('cell_list').size).toBe(1)

    it 'checks that cur_id is the initial cell', ->
        expect(store.get('cur_id')).toEqual(store.get('cell_list').get(0))

    it 'inserts a cell and sees that there are now 2', ->
        actions.insert_cell(1)
        expect(store.get('cells').size).toBe(2)
