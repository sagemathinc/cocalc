misc  = require('smc-util/misc')
{defaults, required} = misc

{Actions, Store, Table, redux} = require('./smc-react')
{alert_message} = require('./alerts')

name = 'system_notifications'

class NotificationsActions extends Actions
    send_message: (opts) =>
        opts = defaults opts,
            id       : misc.uuid()
            time     : new Date()
            text     : required
            priority : 'high'
        table.set(opts)

    # set all recent messages to done
    mark_all_done: =>
        store.get('notifications')?.map (mesg, id) =>
            if not mesg.get('done')
                table.set(id:id, done:true)

actions = redux.createActions(name, NotificationsActions)
store   = redux.createStore(name, {loading:true})

class NotificationsTable extends Table
    query: ->
        return 'system_notifications'

    _change: (table, keys) =>
        actions.setState(loading:false, notifications:table.get())
        t = misc.get_local_storage('system_notifications')
        if t?
            s = misc.from_json(t)
        else
            s = {}
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
        misc.set_local_storage('system_notifications', misc.to_json(s))

table = redux.createTable(name, NotificationsTable)
