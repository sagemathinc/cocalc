flux = require('./flux')
misc = require('misc')

{defaults, required} = misc

{alert_message} = require('./alerts')

class Actions extends flux.Actions
    setTo: (x) -> x

    send_message: (opts) =>
        opts = defaults opts,
            id       : misc.uuid()
            time     : new Date()
            text     : required
            priority : 'high'
        table.set(opts)

    # set all recent messages to done
    mark_all_done: =>
        store.state.notifications?.map (mesg, id) =>
            if not mesg.get('done')
                table.set(id:id, done:true)

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

class Table extends flux.Table
    query: ->
        return 'system_notifications'

    _change: (table, keys) =>
        actions.setTo(loading:false, notifications:table.get())
        # TODO: below is to display a notification old-fashioned way -- will be replaced by react thing later
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


table = flux.flux.createTable('system_notifications', Table)