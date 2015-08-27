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
{Avatar} = require('profile')
misc = require('misc')
{defaults, required} = misc
{TimeAgo, Markdown} = require('r_misc')
{salvus_client} = require('salvus_client')
{synchronized_db} = require('syncdb')

{alert_message} = require('alerts')

# React libraries
{React, rclass, rtypes, Flux, Actions, Store}  = require('flux')
{Loading, TimeAgo} = require('r_misc')
{Col, Grid, Input, Panel, Row, ListGroup, ListGroupItem} = require('react-bootstrap')

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

    # commands to do stuff involving chat

    send_chat: (mesg) =>
        @syncdb.update
            set :
                sender_id : @flux.getStore('account').get_account_id()
                event     : "chat"
                payload   : {content: mesg}
            where :
                date: new Date()
        @syncdb.save()

class ChatStore extends Store
    _init: (flux) =>
        ActionIds = flux.getActionIds(@name)
        @register(ActionIds._set_to, @setState)
        @state = {}

# boilerplate setting up actions, stores, sync'd file, etc.
syncdbs = {}
exports.init_flux = init_flux = (flux, project_id, filename) ->
    name = flux_name(project_id, filename)
    if flux.getActions(name)?
        return  # already initialized
    actions = flux.createActions(name, ChatActions)
    store   = flux.createStore(name, ChatStore)
    store._init(flux)

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

Message = rclass
    displayName: "Message"
    propTypes:
        # example message object
        # {"sender_id":"f117c2f8-8f8d-49cf-a2b7-f3609c48c100","event":"chat","payload":{"content":"l"},"date":"2015-08-26T21:52:51.329Z"}
        payload          : rtypes.object.isRequired
        #date             : rtypes.string
        sender_id        : rtypes.string.isRequired
        sender_is_viewer : rtypes.bool
        user_map         : rtypes.object.isRequired

    getDefaultProps: ->
        sender_is_viewer: false

    get_timeago: ->
        pull = if @props.sender_is_viewer then "pull-left lighten small" else "pull-right lighten small"
        <div className={pull}>
            <TimeAgo date={new Date(@props.date)} />
        </div>

    avatar_column: ->
        <Col key={0} xs={1} style={{display:"inline-block", verticalAlign:"middle"}}>
            <Avatar account={@props.user_map.get(@props.sender_id).toJS()} />
        </Col>

    content_column: ->
        <Col key={1} xs={8}>
            <Panel style={wordWrap:"break-word"}>
                <ListGroup fill>
                    <ListGroupItem>
                        <Markdown value={@props.payload.content} />
                    </ListGroupItem>
                    {@get_timeago()}
                </ListGroup>
            </Panel>
        </Col>

    blank_column:  ->
        <Col key={2} xs={3}></Col>

    render: ->
        cols = []
        if @props.sender_is_viewer
            cols.push(@avatar_column())
            cols.push(@content_column())
            cols.push(@blank_column())
        else
            cols.push(@blank_column())
            cols.push(@content_column())
            cols.push(@avatar_column())

        <Row>
            {cols}
        </Row>

ChatLog = rclass
    displayName: "ChatLog"
    propTypes:
        #array of messages in order!
        messages : rtypes.object.isRequired
        #immutable js map users --> collaborator accnt info
        user_map : rtypes.object
        account_id : rtypes.string

    sort_messages: (a,b) ->
        switch
            when a.date is b.date then 0
            when a.date > b.date then 1
            else -1

    list_messages: ->
        arr = []
        messages = @props.messages.toList().toJS()
        messages.sort @sort_messages
        for i,m of messages
            if m.payload?.content?
                arr.push <Message key={i}
                    sender_is_viewer={m.sender_id is @props.account_id}
                    user_map={@props.user_map} {...m} />
            #else
            #    console.log "BAD MESSAGE!"
            #    console.log m
        return arr

    render: ->
        <div>
            {@list_messages()}
        </div>

ChatRoom = rclass
    displayName: "ChatRoom"
    propTypes :
        messages : rtypes.object
        user_map : rtypes.object
        flux     : rtypes.object
        name     : rtypes.string.isRequired
        account_id : rtypes.string

    getInitialState: ->
        input : ''

    keydown : (e) ->
        @scroll_to_bottom()
        if e.keyCode==27
            #@setState(input:'')
            @clear_input()
        else if e.keyCode==13 and not e.shiftKey
            #@props.flux.getActions(@props.name).send_chat(@state.input)
            @props.flux.getActions(@props.name).send_chat(@refs.input.getValue())
            #@setState(input:'')
            @clear_input()

    clear_input: ->
        React.findDOMNode(@refs.input).children[0].value = ""

    render_input: ->
        #value     = {@state.input}
        #onChange  = {=>@setState(input:@refs.input.getValue())}
        <Input
            autoFocus
            type      = 'text'
            ref       = 'input'
            onKeyDown = {@keydown} />

    chat_log_style:
        overflowY       : "auto"
        overflowX       : "hidden"
        height          : "80vh"
        width           : "45vw"
        margin          : "0"
        padding         : "0"

    chat_input_style:
        height          : "0vh"
        width           : "45vw"
        margin          : "0"
        padding         : "0"

    scroll_to_bottom: ->
        if not @refs.log_container?
            @_scrolled = false
            return
        node = React.findDOMNode(@refs.log_container)
        node.scrollTop = node.scrollHeight
        @_ignore_next_scroll = true
        @_scrolled = false

    on_scroll: (e) ->
        if @_ignore_next_scroll
            @_ignore_next_scroll = false
            return
        @_scrolled = true
        e.preventDefault()

    componentDidUpdate: ->
        if not @_scrolled
            @scroll_to_bottom()

    render : ->
        if not @props.messages? or not @props.flux?
            return <Loading/>
        <Grid>
            <Row>
                <Col md={6} mdOffset={3}>
                    <Panel style={@chat_log_style} ref='log_container' onScroll={@on_scroll} >
                        <ChatLog messages={@props.messages} account_id={@props.account_id} user_map={@props.user_map} />
                    </Panel>
                </Col>
            </Row>
            <Row>
                <Col md={6} mdOffset={3}>
                    <div style={@chat_input_style}>
                        {@render_input()}
                    </div>
                </Col>
            </Row>
        </Grid>

# boilerplate fitting this into SMC below

render = (flux, project_id, path) ->
    name = flux_name(project_id, path)
    <Flux flux={flux} connect_to={messages:name, user_map:'users', account_id : 'account'} >
        <ChatRoom name={name} project_id={project_id} path={path} />
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


