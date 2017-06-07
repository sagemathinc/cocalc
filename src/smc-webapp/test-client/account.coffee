misc   = require('smc-util/misc')
expect = require('expect')
async  = require('async')

describe 'test the account store', ->

    store   = smc.redux.getStore('account')
    table   = smc.redux.getTable('account')
    actions = smc.redux.getActions('account')

    it 'verifies that account_id is a valid uuid', ->
        misc.is_valid_uuid_string(store.get_account_id())

describe 'test the account Table', ->
    store   = smc.redux.getStore('account')
    table   = smc.redux.getTable('account')
    actions = smc.redux.getActions('account')

    it 'gets the first name, changes it, verifies that it is changed, then changes it back', (done) ->
        @timeout(5000)
        first_name = store.get('first_name')
        table.set({"first_name": "First Name"})
        expect(store.get('first_name')).toEqual("First Name")
        # wait until after saved to change back (otherwise change gets unset by message back -- we may want to change this behavior!)
        table._table.save (err) ->
            table.set({"first_name": first_name})
            expect(store.get('first_name')).toEqual(first_name)
            done(err)

