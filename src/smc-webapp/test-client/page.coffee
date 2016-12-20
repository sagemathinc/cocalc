expect = require('expect')
misc = require('misc')
async = require('async')

actions = smc.redux.getActions('page')
store   = smc.redux.getStore('page')

describe 'tests opening each page', ->

    it 'opens the projects page', ->
        actions.set_active_tab('projects')
        expect(document.title).toEqual("Projects - SageMathCloud")
        expect(misc.endswith(window.location.href, '/projects')).toEqual(true)
        expect($(".fa-thumb-tack:visible").length).toEqual(1)  # there's one thumbtack icon

    it 'opens the accounts page', ->
        actions.set_active_tab('account')
        expect(document.title).toEqual("Account - SageMathCloud")
        expect(misc.endswith(window.location.href, '/settings')).toEqual(true)
        expect($(".fa-user:visible").length).toEqual(1)  # there's one user icon
        expect($("#account-page-tabs").length).toEqual(1)

    it 'opens the about page', ->
        actions.set_active_tab('about')
        expect(document.title).toEqual("Help - SageMathCloud")
        expect(misc.endswith(window.location.href, '/help')).toEqual(true)
        expect($(".fa-support:visible").length).toEqual(1)

describe 'tests fullscreen', ->

    it 'activates fullscreen mode via action', ->
        actions.set_fullscreen(true)
        expect($(".navbar-nav").length).toEqual(0)

    it 'leaves fullscreen mode via action', ->
        actions.set_fullscreen(false)
        expect($(".navbar-nav").length).toBeGreaterThan(0)

describe 'test showing the connection information', ->

    it 'shows the connection dialog', ->
        actions.show_connection(true)
        expect($("h4:contains('Connection')").length).toEqual(1)
        expect(store.get("show_connection")).toEqual(true)

    it 'hides the connection dialog', ->
        actions.show_connection(false)
        expect($("h4:contains('Connection')").length).toEqual(0)
        expect(store.get("show_connection")).toEqual(false)



