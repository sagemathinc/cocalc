misc   = require('smc-util/misc')
expect = require('expect')

describe 'create a project and make some changes using projects action', ->
    project_id = undefined
    actions    = smc.redux.getActions('projects')
    store      = smc.redux.getStore('projects')

    it 'creates a project and waits until created', (done) ->
        @timeout(5000)
        token = misc.uuid()
        actions.create_project
            title       : "TEST project"
            description : "TEST description"
            token       : token
        store.wait_until_project_created token, 3, (err, _project_id) =>
            project_id = _project_id
            done(err)

    it 'confirms that we have info about this project', ->
        expect(actions.have_project(project_id)).toEqual(true)

    it 'confirms that we do not have info about random project', ->
        expect(actions.have_project(misc.uuid())).toEqual(false)

    it 'confirms the title and description are as set', ->
        store = store
        expect(store.get_title(project_id)).toEqual("TEST project")
        expect(store.get_description(project_id)).toEqual("TEST description")

    it 'changes the title', ->
        actions.set_project_title(project_id, "TEST project -- Better Title")
        expect(store.get_title(project_id)).toEqual("TEST project -- Better Title")

    it 'changes the description', ->
        actions.set_project_description(project_id, "TEST project -- Better Description")
        expect(store.get_description(project_id)).toEqual("TEST project -- Better Description")

    # Use the explicit other user version (TODO: add test involving a different user later)
    it 'hides the project from myself', ->
        actions.set_project_hide(smc.client.account_id, project_id, true)
        expect(store.is_hidden_from(project_id, smc.client.account_id)).toEqual(true)

    it 'then shows it to myself again', ->
        actions.set_project_hide(smc.client.account_id, project_id, false)
        expect(store.is_hidden_from(project_id, smc.client.account_id)).toEqual(false)

    # Use the toggle version
    it 'toggles visibility of project off', ->
        actions.toggle_hide_project(project_id)
        expect(store.is_hidden_from(project_id, smc.client.account_id)).toEqual(true)

    it 'toggles visibility of project back on', ->
        actions.toggle_hide_project(project_id)
        expect(store.is_hidden_from(project_id, smc.client.account_id)).toEqual(false)

    it 'deletes the project', ->
        # TODO: needs to be part of teardown and be destructive!
        actions.delete_project(project_id)

