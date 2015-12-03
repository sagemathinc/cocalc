###
Redux: server stats
###

{Table, redux} = require('./smc-react')

name    = 'server_stats'
actions = redux.createActions(name)
store   = redux.createStore(name, {loading:true})

class StatsTable extends Table
    query: ->
        return 'stats'

    _change: (table, keys) =>
        newest = undefined
        for obj in table.get(keys).toArray()
            if obj? and (not newest? or obj.get('time') > newest.get('time'))
                newest = obj
        if newest
            newest = newest.toJS()
            newest.loading = false
            actions.setState(newest)

redux.createTable(name, StatsTable)