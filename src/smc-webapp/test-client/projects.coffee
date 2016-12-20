misc   = require('smc-util/misc')
expect = require('expect')

describe 'test basics about projects', ->
    account = undefined

    it 'gets a list of projects', ->
        projects = smc.redux.getStore('projects')


