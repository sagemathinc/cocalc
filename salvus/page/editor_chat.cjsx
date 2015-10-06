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
{Avatar, UsersViewingDocument} = require('profile')
misc = require('misc')
{defaults, required} = misc
{Markdown, TimeAgo, Tip} = require('r_misc')
{salvus_client} = require('salvus_client')
{synchronized_db} = require('syncdb')

{alert_message} = require('alerts')

# React libraries
{React, rclass, rtypes, Flux, Actions, Store}  = require('flux')
{Icon, Loading, TimeAgo} = require('r_misc')
{Button, Col, Grid, Input, ListGroup, ListGroupItem, Panel, Row} = require('react-bootstrap')

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
        if m != messages
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

    set_input: (input) =>
        @_set_to(input:input)

class ChatStore extends Store
    _init: (flux) =>
        ActionIds = flux.getActionIds(@name)
        @register(ActionIds._set_to, @setState)
        @state =
            messages : immutable.fromJS({})
            input    : ''

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
        sync_interval : 0
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
        message    : rtypes.object.isRequired  # immutable.js message object
        account_id : rtypes.string.isRequired
        user_map   : rtypes.object.isRequired
        project_id : rtypes.string    # optional -- improves relative links if given
        file_path  : rtypes.string    # optional -- (used by renderer; path containing the chat log)

    shouldComponentUpdate: (next) ->
        return @props.message != next.message or @props.user_map != next.user_map or @props.account_id != next.account_id

    sender_is_viewer: ->
        @props.account_id == @props.message.get('sender_id')

    get_timeago: ->
        if @sender_is_viewer()
            pull = "pull-left small"
        else
            pull = "pull-right small"
        <div className={pull} style={color:'#888', marginTop:'2px'}>
            <TimeAgo date={new Date(@props.message.get('date'))} />
        </div>

    avatar_column: ->
        account = @props.user_map.get(@props.message.get('sender_id'))?.toJS()
        if account?  # TODO: do something better when we don't know the user (or when sender account_id is bogus)
            <Col key={0} xs={1} style={{display:"inline-block", verticalAlign:"middle"}}>
                <Avatar account={account} />
            </Col>

    content_column: ->
        value = @props.message.get('payload')?.get('content')
        # just for fun.
        value = value.replace(/:-\)/g, "☺").replace(/:-\(/g, "☹").replace(/<3/g, "♡")
        value = value.replace(/:shrug:/g, "¯\\\\_(ツ)_/¯").replace(/o_o/g, "סּ_סּ").replace(/:-p/g, "😛").replace(/\^\^/g, "😄")
        <Col key={1} xs={8}>
            <Panel style={wordWrap:"break-word"}>
                <ListGroup fill>
                    <ListGroupItem>
                        <Markdown value={value} project_id={@props.project_id} file_path={@props.file_path} />
                    </ListGroupItem>
                    {@get_timeago()}
                </ListGroup>
            </Panel>
        </Col>

    blank_column:  ->
        <Col key={2} xs={3}></Col>

    render: ->
        cols = []
        if @sender_is_viewer()
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
        messages   : rtypes.object.isRequired   # immutable js map {timestamps} --> message.
        user_map   : rtypes.object.isRequired   # immutable js map {collaborators} --> account info
        account_id : rtypes.string
        project_id : rtypes.string   # optional -- used to render links more effectively
        file_path  : rtypes.string   # optional -- ...

    shouldComponentUpdate: (next) ->
        return @props.messages != next.messages or @props.user_map != next.user_map or @props.account_id != next.account_id

    list_messages: ->
        v = {}
        @props.messages.map (mesg, date) =>
            v[date] = <Message key={date}
                    account_id = {@props.account_id}
                    user_map   = {@props.user_map}
                    message    = {mesg}
                    project_id = {@props.project_id}
                    file_path  = {@props.file_path}
                />
        k = misc.keys(v).sort()
        return (v[date] for date in k)

    render: ->
        <div>
            {@list_messages()}
        </div>

ChatRoom = rclass
    displayName: "ChatRoom"
    propTypes :
        messages    : rtypes.object
        user_map    : rtypes.object
        flux        : rtypes.object
        name        : rtypes.string.isRequired
        account_id  : rtypes.string
        input       : rtypes.string
        project_id  : rtypes.string.isRequired
        file_use_id : rtypes.string.isRequired
        file_use    : rtypes.object
        path        : rtypes.string

    getInitialState: ->
        input : ''

    keydown : (e) ->
        @scroll_to_bottom()
        if e.keyCode==27
            @clear_input()
            e.preventDefault()
        else if e.keyCode==13 and not e.shiftKey
            @props.flux.getActions(@props.name).send_chat(@refs.input.getValue())
            @clear_input()
            e.preventDefault()

    clear_input: ->
        @props.flux.getActions(@props.name).set_input('')

    render_input: ->
        tip = <span>
            You may enter (Github flavored) markdown here and include Latex mathematics in $ signs.  In particular, use # for headings, > for block quotes, *'s for italic text, **'s for bold text, - at the beginning of a line for lists, back ticks ` for code, and URL's will automatically become links.   Press shift+enter for a newline without submitting your chat.
        </span>

        return <div>
            <Input
                autoFocus
                rows      = 4
                type      = 'textarea'
                ref       = 'input'
                onKeyDown = {@keydown}
                value     = {@props.input}
                onChange  = {(value)=>@props.flux.getActions(@props.name).set_input(@refs.input.getValue())}
                />
            <div style={marginTop: '-15px', marginBottom: '15px', color:'#666'}>
                <Tip title='Use Markdown' tip={tip}>
                    Shift+Enter for newline.
                    Format using <a href='https://help.github.com/articles/markdown-basics/' target='_blank'>Markdown</a>.
                    Emoticons: :-), :-\, <3, o_o, :-p, :shrug: or ^^.
                </Tip>
            </div>
        </div>

    chat_log_style:
        overflowY    : "auto"
        overflowX    : "hidden"
        height       : "60vh"
        margin       : "0"
        padding      : "0"
        paddingRight : "10px"

    chat_input_style:
        height       : "0vh"
        margin       : "0"
        padding      : "0"
        marginTop    : "5px"

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

    componentDidMount: ->
        if not @_scrolled
            @scroll_to_bottom()

    componentDidUpdate: ->
        if not @_scrolled
            @scroll_to_bottom()

    show_files : ->
        @props.flux?.getProjectActions(@props.project_id).set_focused_page('project-file-listing')

    render : ->
        if not @props.messages? or not @props.flux? or not @props.user_map?
            return <Loading/>
        <Grid>
            <Row style={marginBottom:'5px'}>
                <Col xs={4}>
                    <Button className='smc-small-only' bsSize='large'
                            onClick={@show_files}><Icon name='toggle-up'/> Files
                    </Button>
                </Col>
                <Col xs={4}>
                    <div style={float:'right'}>
                        <UsersViewingDocument
                              file_use_id = {@props.file_use_id}
                              file_use    = {@props.file_use}
                              account_id  = {@props.account_id}
                              user_map    = {@props.user_map} />
                    </div>
                </Col>
            </Row>
            <Row>
                <Col md={8} mdOffset={2}>
                    <Panel style={@chat_log_style} ref='log_container' onScroll={@on_scroll} >
                        <ChatLog messages={@props.messages} account_id={@props.account_id} user_map={@props.user_map}
                                 project_id={@props.project_id} file_path={if @props.path? then misc.path_split(@props.path).head} />
                    </Panel>
                </Col>
            </Row>
            <Row>
                <Col md={8} mdOffset={2}>
                    <div style={@chat_input_style}>
                        {@render_input()}
                    </div>
                </Col>
            </Row>
        </Grid>

# boilerplate fitting this into SMC below

render = (flux, project_id, path) ->
    name = flux_name(project_id, path)
    file_use_id = require('schema').client_db.sha1(project_id, path)
    connect_to =
        messages   : name
        input      : name
        user_map   :'users'
        account_id : 'account'
        file_use   : 'file_use'
    <Flux flux={flux} connect_to=connect_to >
        <ChatRoom name={name} project_id={project_id} path={path} file_use_id={file_use_id} />
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


