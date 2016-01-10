##############################################################################
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
{Avatar, UsersViewingDocument} = require('./profile')
misc = require('smc-util/misc')
misc_page = require('./misc_page')
{defaults, required} = misc
{Markdown, TimeAgo, Tip} = require('./r_misc')
{salvus_client} = require('./salvus_client')
{synchronized_db} = require('./syncdb')

{alert_message} = require('./alerts')

# React libraries
{React, ReactDOM, rclass, rtypes, Actions, Store, Redux}  = require('./smc-react')
{Icon, Loading, TimeAgo} = require('./r_misc')
{Button, Col, Grid, Input, ListGroup, ListGroupItem, Panel, Row} = require('react-bootstrap')

{User} = require('./users')

redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

class ChatActions extends Actions
    _syncdb_change: (changes) =>
        m = messages = @redux.getStore(@name).get('messages')
        for x in changes
            if x.insert
                messages = messages.set(x.insert.date - 0, immutable.fromJS(x.insert))
            else if x.remove
                messages = messages.delete(x.remove.date - 0)
        if m != messages
            @setState(messages: messages)

    send_chat: (mesg) =>
        mesg = misc_page.sanitize_html(mesg)
        if not @syncdb?
            # TODO: give an error or try again later?
            return
        @syncdb.update
            set :
                sender_id : @redux.getStore('account').get_account_id()
                event     : "chat"
                payload   : {content: mesg}
            where :
                date: new Date()
        @syncdb.save()

    set_input: (input) =>
        @setState(input:input)

# boilerplate setting up actions, stores, sync'd file, etc.
syncdbs = {}
exports.init_redux = init_redux = (redux, project_id, filename) ->
    name = redux_name(project_id, filename)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, ChatActions)
    store   = redux.createStore(name, {messages: immutable.Map(), input:''})

    synchronized_db
        project_id    : project_id
        filename      : filename
        sync_interval : 0
        cb            : (err, syncdb) ->
            if err
                alert_message(type:'error', message:"unable to open #{@filename}")
            else
                v = {}
                for x in syncdb.select()
                    v[x.date - 0] = x
                actions.setState(messages : immutable.fromJS(v))
                syncdb.on('change', actions._syncdb_change)
                store.syncdb = actions.syncdb = syncdb

Message = rclass
    displayName: "Message"

    propTypes:
        # example message object
        # {"sender_id":"f117c2f8-8f8d-49cf-a2b7-f3609c48c100","event":"chat","payload":{"content":"l"},"date":"2015-08-26T21:52:51.329Z"}
        message    : rtypes.object.isRequired  # immutable.js message object
        account_id : rtypes.string.isRequired
        user_map   : rtypes.object
        project_id : rtypes.string    # optional -- improves relative links if given
        file_path  : rtypes.string    # optional -- (used by renderer; path containing the chat log)

    shouldComponentUpdate: (next) ->
        return @props.message != next.message or @props.user_map != next.user_map or @props.account_id != next.account_id

    sender_is_viewer: ->
        @props.account_id == @props.message.get('sender_id')

    get_timeago: ->
        if @sender_is_viewer()
            pull = "pull-right small"
        else
            pull = "pull-left small"
        <div className={pull} style={color:'#888', marginTop:'2px'}>
            <TimeAgo date={new Date(@props.message.get('date'))} />
        </div>

    avatar_column: ->
        account = @props.user_map?.get(@props.message.get('sender_id'))?.toJS()
        if account?  # TODO: do something better when we don't know the user (or when sender account_id is bogus)
            <Col key={0} xs={1} style={{display:"inline-block", verticalAlign:"middle"}}>
                <Avatar account={account} />
            </Col>

    content_column: ->
        value = @props.message.get('payload')?.get('content')
        if @sender_is_viewer()
            color = '#f5f5f5'
        else
            color = '#fff'

        # smileys, just for fun.
        value = misc.smiley
            s: value
            wrap: ['<span class="smc-editor-chat-smiley">', '</span>']
        value = misc_page.sanitize_html(value)

        <Col key={1} xs={8}>
            <Panel style={wordWrap:"break-word"}>
                <ListGroup fill>
                    <ListGroupItem style={background:color}>
                        <Markdown value={value}
                                  project_id={@props.project_id}
                                  file_path={@props.file_path} />
                    </ListGroupItem>
                    {@get_timeago()}
                </ListGroup>
            </Panel>
        </Col>

    blank_column:  ->
        <Col key={2} xs={3}></Col>

    render: ->
        cols = [ @avatar_column(), @content_column(), @blank_column()]
        # mirror right-left for sender's view
        if @sender_is_viewer()
            cols = cols.reverse()
        <Row>
            {cols}
        </Row>

ChatLog = rclass
    displayName: "ChatLog"

    propTypes:
        messages   : rtypes.object.isRequired   # immutable js map {timestamps} --> message.
        user_map   : rtypes.object              # immutable js map {collaborators} --> account info
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

ChatRoom = (name) -> rclass
    displayName: "ChatRoom"

    reduxProps :
        "#{name}" :
            messages : rtypes.immutable
            input    : rtypes.string
        users :
            user_map : rtypes.immutable
        account :
            account_id : rtypes.string
        file_use :
            file_use : rtypes.immutable

    propTypes :
        redux       : rtypes.object
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        file_use_id : rtypes.string.isRequired
        path        : rtypes.string

    getInitialState: ->
        input : ''

    keydown : (e) ->
        @scroll_to_bottom()
        if e.keyCode==27 # ESC
            e.preventDefault()
            @clear_input()
        else if e.keyCode==13 and not e.shiftKey # 13: enter key
            e.preventDefault()
            mesg = @refs.input.getValue()
            # block sending empty messages
            if mesg.length? and mesg.length >= 1
                @props.redux.getActions(@props.name).send_chat(mesg)
                @clear_input()

    clear_input: ->
        @props.redux.getActions(@props.name).set_input('')

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
                onChange  = {(value)=>@props.redux.getActions(@props.name).set_input(@refs.input.getValue())}
                />
            <div style={marginTop: '-15px', marginBottom: '15px', color:'#666'}>
                <Tip title='Use Markdown' tip={tip}>
                    Shift+Enter for newline.
                    Format using <a href='https://help.github.com/articles/markdown-basics/' target='_blank'>Markdown</a>.
                    Emoticons: {misc.emoticons}.
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
        node = ReactDOM.findDOMNode(@refs.log_container)
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
        @props.redux?.getProjectActions(@props.project_id).set_focused_page('project-file-listing')

    render : ->
        if not @props.messages? or not @props.redux?
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
                <Col md={12}>
                    <Panel style={@chat_log_style} ref='log_container' onScroll={@on_scroll} >
                        <ChatLog messages={@props.messages} account_id={@props.account_id} user_map={@props.user_map}
                                 project_id={@props.project_id} file_path={if @props.path? then misc.path_split(@props.path).head} />
                    </Panel>
                </Col>
            </Row>
            <Row>
                <Col md={12}>
                    <div style={@chat_input_style}>
                        {@render_input()}
                    </div>
                </Col>
            </Row>
        </Grid>

# boilerplate fitting this into SMC below

render = (redux, project_id, path) ->
    name = redux_name(project_id, path)
    file_use_id = require('smc-util/schema').client_db.sha1(project_id, path)
    C = ChatRoom(name)
    <Redux redux={redux}>
        <C redux={redux} name={name} project_id={project_id} path={path} file_use_id={file_use_id} />
    </Redux>

exports.render = (project_id, path, dom_node, redux) ->
    init_redux(redux, project_id, path)
    ReactDOM.render(render(redux, project_id, path), dom_node)

exports.hide = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, path, dom_node, redux) ->
    ReactDOM.render(render(redux, project_id, path), dom_node)

exports.free = (project_id, path, dom_node, redux) ->
    fname = redux_name(project_id, path)
    store = redux.getStore(fname)
    if not store?
        return
    ReactDOM.unmountComponentAtNode(dom_node)
    store.syncdb?.destroy()
    delete store.state
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    redux.removeStore(fname)
    redux.removeActions(fname)


