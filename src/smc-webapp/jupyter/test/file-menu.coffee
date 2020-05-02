#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Tests of editing the cells in a notebook
###

actions = store = undefined
setup = (cb) -> (require('./setup').setup (err, x) -> actions=x; store=x?.store; cb(err))
{teardown} = require('./setup')

expect  = require('expect')

describe 'test file-->open -- ', ->
    before(setup)
    after(teardown)

    it 'do the file open action', ->
        actions.file_open()
        store = actions.redux.getProjectStore(store.get('project_id'))
        expect(store.active_project_tab).toBe('files')