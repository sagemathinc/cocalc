misc   = require('smc-util/misc')
expect = require('expect')
async  = require('async')

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

    it 'opens project tab', ->
        actions.open_project
            project_id : project_id
            switch_to  : true        # so user can watch :-)

    it 'confirms that we have info about this project', ->
        expect(actions.have_project(project_id)).toEqual(true)

    it 'confirms that we do not have info about random project', ->
        expect(actions.have_project(misc.uuid())).toEqual(false)

    it 'confirms the title and description are as set', ->
        store = store
        expect(store.get_title(project_id)).toEqual("TEST project")
        expect(store.get_description(project_id)).toEqual("TEST description")

    it 'confirms the document title at the top changes', ->
        expect(document.title).toEqual("TEST project - SageMathCloud")

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
        smc.redux.getActions('page').close_project_tab(project_id)
        actions.stop_project(project_id)
        actions.delete_project(project_id)

describe 'starting and stopping a project and getting directory listing', ->
    project_id = undefined
    actions    = smc.redux.getActions('projects')
    store      = smc.redux.getStore('projects')

    it 'creates a project and waits until created', (done) ->
        @timeout(5000)
        token = misc.uuid()
        actions.create_project
            title       : "TEST start/stop project"
            description : "Test starting and stopping a project"
            token       : token
        store.wait_until_project_created token, 3, (err, _project_id) =>
            project_id = _project_id
            done(err)

    it 'opens project tab', ->
        actions.open_project
            project_id : project_id
            switch_to  : true        # so user can watch :-)
        expect(document.title).toEqual("TEST start/stop project - SageMathCloud")
        expect(misc.endswith(window.location.href, "/projects/#{project_id}/")).toEqual(true)

    it 'starts the NEW project running and waits until running', (done) ->
        @timeout(25000)
        actions.start_project(project_id)
        store.wait
            until : => store.get_project(project_id).state?.state == 'running'
            cb    : done

    it 'stops project running and waits until stopped', (done) ->
        @timeout(10000)
        actions.stop_project(project_id)
        store.wait
            until : => store.get_project(project_id).state?.state == 'opened'
            cb    : done

    it 'starts project running again', (done) ->
        @timeout(10000)
        actions.start_project(project_id)
        store.wait
            until : => store.get_project(project_id).state?.state == 'running'
            cb    : done

    it 'gets directory listing (and confirm is empty list)', (done) ->
        @timeout(5000)
        smc.redux.getProjectActions(project_id).fetch_directory_listing()
        s = smc.redux.getProjectStore(project_id)
        s.wait
            until : => s.getIn(['directory_listings', ""])?.toJS()?.length == 0
            cb    : done

    it 'gets directory listing including hidden (and confirm some dirs)', (done) ->
        @timeout(5000)
        smc.redux.getProjectActions(project_id).fetch_directory_listing({path:'', sort_by_time:true, show_hidden:true})
        s = smc.redux.getProjectStore(project_id)
        s.wait
            until : => s.getIn(['directory_listings', ""])?.toJS()?.length > 0
            cb    : done

    it 'gets .smc directory listing', (done) ->
        @timeout(5000)
        smc.redux.getProjectActions(project_id).fetch_directory_listing({path: '.smc'})
        s = smc.redux.getProjectStore(project_id)
        s.wait
            until : -> s.getIn(['directory_listings', '.smc'])?.toJS()?.length > 0
            cb    : (err) ->
                if err
                    done(err)
                    return
                v = s.getIn(['directory_listings', '.smc'])?.toJS()
                for x in v
                    delete x.mtime  # too random to test
                    delete x.size
                expect(v).toEqual([{"isdir":true,"name":"local_hub"},{"isdir":true,"name":"root"},{"name":"secret_token"},{"name":"info.json"}])
                done()

    it 'deletes the project', ->
        # TODO: needs to be destructive!
        smc.redux.getActions('page').close_project_tab(project_id)
        actions.stop_project(project_id)
        actions.delete_project(project_id)

###
describe 'create and start project and edit a file in it', ->
    project_id = undefined
    actions    = smc.redux.getActions('projects')
    store      = smc.redux.getStore('projects')

    it 'creates a project and waits until created', (done) ->
        @timeout(5000)
        token = misc.uuid()
        actions.create_project
            title       : "TEST editing project"
            description : "Test creating and editing a file"
            token       : token
        actions.open_project
            project_id : project_id
            switch_to  : true        # so user can watch :-)
        store.wait_until_project_created token, 3, (err, _project_id) =>
            project_id = _project_id
            done(err)

    it 'starts the new project running and waits until running', (done) ->
        @timeout(25000)
        actions.start_project(project_id)
        store.wait
            until : => store.get_project(project_id).state?.state == 'running'
            cb    : done

    it 'deletes the project', ->
        # TODO: needs to be destructive!
        smc.redux.getActions('page').close_project_tab(project_id)
        actions.stop_project(project_id)
        actions.delete_project(project_id)
###

