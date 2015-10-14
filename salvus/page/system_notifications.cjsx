flux = require('flux')
misc = require('misc')

{alert_message} = require('alerts')

# Later we will use flux and react for this, so get stuff in place.  For now we're just popping up notifications
# for high-priority events.

###
class Actions extends flux.Actions
    setTo: (x) -> x

actions = flux.flux.createActions('system_notifications', Actions)

class Store extends flux.Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('system_notifications')
        @register(ActionIds.setTo, @setTo)
        @state = {loading:true}
    setTo: (x) ->
        @setState(x)

store = flux.flux.createStore('system_notifications', Store)
###

class Table extends flux.Table
    query: ->
        return 'system_notifications'

    _change: (table, keys) =>
        #actions.setTo(loading:false, notifications:table.get())
        s = {}
        if localStorage?
            try
                s = misc.from_json(localStorage.system_notifications)
            catch e
                # pass
        # show any message from the last hour that we haven't seen already
        recent = misc.minutes_ago(60)
        table.get().map (m, id) =>
            if not s[id]?
                mesg = m.toJS()
                if mesg.time >= recent and mesg.priority == 'high' and not mesg.done
                    s[id] = mesg.time
                    alert_message(type:'info', message:"SYSTEM MESSAGE (#{mesg.time.toLocaleString()}): #{mesg.text}", timeout:3600)
        # also delete older stuff from localStorage.system_notifications
        for id, x of s
            if x.time < recent
                delete s[id]
        localStorage.system_notifications = misc.to_json(s)

flux.flux.createTable('system_notifications', Table)