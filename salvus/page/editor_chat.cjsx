###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

###
Chat
###

# standard non-SMC libraries
immutable = require('immutable')

# SMC libraries
misc = require('misc')
{defaults, required} = misc
{salvus_client} = require('salvus_client')
{synchronized_db} = require('syncdb')

{alert_message} = require('alerts')

# React libraries
{React, rclass, rtypes, Flux, Actions, Store}  = require('flux')
{Loading} = require('r_misc')
{Input} = require('react-bootstrap')

{User} = require('users')

flux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

class ChatActions extends Actions
    # INTERNAL API
    _set_to: (payload) =>
        payload
    _syncdb_change: (changes) =>
        m = messages = @flux.getStore(@name).state.messages
        for x in changes
            if x.insert
                messages = messages.set(x.insert.date - 0, immutable.fromJS(x.insert))
            else if x.remove
                messages = messages.delete(x.remove.date - 0)
        if not m.equals(messages)
            @_set_to(messages: messages)
    send_chat: (mesg) =>
        @syncdb.update
            set : 
                sender_id : @flux.getStore('account').get_account_id()
                event     : "chat"
                payload   : {content: mesg}
            where : 
                date:new Date()
        @syncdb.save()

class ChatStore extends Store
    _init: (flux) =>
        ActionIds = flux.getActionIds(@name)
        @register(ActionIds._set_to, @setState)
        @state = {}
        
syncdbs = {}
exports.init_flux = init_flux = (flux, project_id, filename) ->
    name = flux_name(project_id, filename)
    if flux.getActions(name)?
        return  # already initialized
    actions = flux.createActions(name, ChatActions)
    store   = flux.createStore(name, ChatStore)
    store._init(flux)
    
    console.log("getting syncdb for '#{filename}'")
    synchronized_db
        project_id : project_id
        filename   : filename
        cb         : (err, syncdb) ->
            if err
                alert_message(type:'error', message:"unable to open #{@filename}")
            else
                v = {}
                for x in syncdb.select()
                    v[x.date - 0] = x
                store.setState(messages : immutable.fromJS(v))
                syncdb.on('change', actions._syncdb_change)
                store.syncdb = actions.syncdb = syncdb
                
ChatRoom = rclass
    propTypes : 
        messages : rtypes.object
        user_map : rtypes.object
        flux     : rtypes.object
        name     : rtypes.string.isRequired
        

    getInitialState: ->
        input : ''

    render_chat_log: ->
        # dumb
        m = @props.messages.toJS()
        for date in misc.keys(m).sort().reverse()
            <div key={date} className='well'>{misc.to_json(m[date])}</div>
            
    keydown : (e) ->
        if e.keyCode==27
            @setState(input:'')
        else if e.keyCode==13 and not e.shiftKey
            @props.flux.getActions(@props.name).send_chat(@state.input)
            @setState(input:'')
            
    render_input: ->
        <Input
            autoFocus
            type      = 'text'
            ref       = 'input'
            value     = {@state.input}
            onChange  = {=>@setState(input:@refs.input.getValue())}
            onKeyDown = {@keydown}
            />    
        
    render : ->
        if not @props.messages? or not @props.flux?
            return <Loading/>
        <div>
            <h4>A Chatroom</h4>
            <div>{@render_input()}</div>
            <div>{@render_chat_log()}</div>
        </div>

render = (flux, project_id, path) ->
    name = flux_name(project_id, path)
    <Flux flux={flux} connect_to={messages:name, user_map:'users'} >
        <ChatRoom name={name} project_id={project_id} path={path} name={name} />
    </Flux>

exports.render = (project_id, path, dom_node, flux) ->
    init_flux(flux, project_id, path)
    React.render(render(flux, project_id, path), dom_node)

exports.hide = (project_id, path, dom_node, flux) ->
    React.unmountComponentAtNode(dom_node)

exports.show = (project_id, path, dom_node, flux) ->
    React.render(render(flux, project_id, path), dom_node)

exports.free = (project_id, path, dom_node, flux) ->
    fname = flux_name(project_id, path)
    store = flux.getStore(fname)
    if not store?
        return
    React.unmountComponentAtNode(dom_node)
    store.syncdb.destroy()
    delete store.state
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    flux.removeStore(fname)
    flux.removeActions(fname)


