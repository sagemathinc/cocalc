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
Chat message JSON format:

sender_id : String which is the original message sender's account id
event     : Can only be "chat" right now.
date      : A date string
history   : Array of "History" objects (described below)
editing   : Object of <account id's> : <"TODO">

"TODO" Will likely contain their last edit in the future

 --- History object ---
author_id : String which is this message version's author's account id
content   : The raw display content of the message
date      : The date this edit was sent

Example object:
{"sender_id":"07b12853-07e5-487f-906a-d7ae04536540",
"event":"chat",
"history":[
        {"author_id":"07b12853-07e5-487f-906a-d7ae04536540","content":"First edited!","date":"2016-07-23T23:10:15.331Z"},
        {"author_id":"07b12853-07e5-487f-906a-d7ae04536540","content":"Initial sent message!","date":"2016-07-23T23:10:04.837Z"}
        ],
"date":"2016-07-23T23:10:04.837Z","editing":{"07b12853-07e5-487f-906a-d7ae04536540":"TODO"}}
---

Chat message types after immutable conversion:
(immutable.Map)
sender_id : String
event     : String
date      : Date Object
history   : immutable.Stack of immutable.Maps
editing   : immutable.Map

###

# standard non-SMC libraries
immutable = require('immutable')
{IS_MOBILE} = require('./feature')

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
{Button, Col, Grid, Input, ListGroup, ListGroupItem, Panel, Row, ButtonGroup} = require('react-bootstrap')

{User} = require('./users')

redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

class ChatActions extends Actions
    _syncdb_change: (changes) =>
        m = messages = @redux.getStore(@name).get('messages')
        for x in changes
            if x.insert
                # Assumes all fields to be provided in x.insert
                # console.log('Received', x.insert)
                # OPTIMIZATION: make into custom conversion to immutable
                message = immutable.fromJS(x.insert)
                message = message.set('history', immutable.Stack(immutable.fromJS(x.insert.history)))
                message = message.set('editing', immutable.Map(x.insert.editing))
                messages = messages.set("#{x.insert.date - 0}", message)
            else if x.remove
                messages = messages.delete(x.remove.date - 0)
        if m != messages
            @setState(messages: messages)

    send_chat: (mesg) =>
        if not @syncdb?
            # TODO: give an error or try again later?
            return
        sender_id = @redux.getStore('account').get_account_id()
        time_stamp = salvus_client.server_time()
        @syncdb.update
            set :
                sender_id : sender_id
                event     : "chat"
                history   : [{author_id: sender_id, content:mesg, date:time_stamp}]
            where :
                date: time_stamp
            is_equal: (a, b) => (a - 0) == (b - 0)

        #console.log("-- History:", [{author_id: sender_id, content:mesg, date:time_stamp}] )

        @syncdb.save()
        @setState(last_sent: mesg)

    set_editing: (message, is_editing) =>
        if not @syncdb?
            # TODO: give an error or try again later?
            return
        author_id = @redux.getStore('account').get_account_id()

        if is_editing
            # TODO: Save edit changes
            editing = message.get('editing').set(author_id, 'TODO')
        else
            editing = message.get('editing').remove(author_id)

        # console.log("Currently Editing:", editing.toJS())
        @syncdb.update
            set :
                history : message.get('history').toJS()
                editing : editing.toJS()
            where :
                date: message.get('date')
            is_equal: (a, b) => (a - 0) == (b - 0)
        @syncdb.save()

    send_edit: (message, mesg) =>
        if not @syncdb?
            # TODO: give an error or try again later?
            return
        author_id = @redux.getStore('account').get_account_id()
        # OPTIMIZATION: send less data over the network?
        time_stamp = salvus_client.server_time()

        @syncdb.update
            set :
                history : [{author_id: author_id, content:mesg, date:time_stamp}].concat(message.get('history').toJS())
                editing : message.get('editing').remove(author_id).toJS()
            where :
                date: message.get('date')
            is_equal: (a, b) => (a - 0) == (b - 0)
        @syncdb.save()

    set_to_last_input: =>
        @setState(input:@redux.getStore(@name).get('last_sent'))

    set_input: (input) =>
        @setState(input:input)

    save_scroll_state: (position, height, offset) =>
        # height == 0 means chat room is not rendered
        if height != 0
            @setState(saved_position:position, height:height, offset:offset)


# boilerplate setting up actions, stores, sync'd file, etc.
syncdbs = {}
exports.init_redux = init_redux = (redux, project_id, filename) ->
    name = redux_name(project_id, filename)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, ChatActions)
    store   = redux.createStore(name, {input:''})

    synchronized_db
        project_id    : project_id
        filename      : filename
        sync_interval : 0
        cb            : (err, syncdb) ->
            if err
                alert_message(type:'error', message:"unable to open #{@filename}")
            else
                store.syncdb = actions.syncdb = syncdb

                if not syncdb.valid_data
                    # This should never happen, but obviously it can -- just open the file and randomly edit with vim!
                    # If there were any corrupted chats, append them as a new chat at the bottom, then delete from syncdb.
                    corrupted = (x.corrupt for x in syncdb.select() when x.corrupt?)
                    actions.send_chat("Corrupted chat: " + corrupted.join('\n\n'))
                    syncdb.delete_with_field(field:'corrupt')

                v = {}
                for x in syncdb.select()
                    if x.corrupt?
                        continue
                    if x.history
                        x.history = immutable.Stack(immutable.fromJS(x.history))
                    else if x.payload? # for old chats with payload: content
                        initial = immutable.fromJS
                            content   : x.payload.content
                            author_id : x.sender_id
                            date      : x.date
                        x.history = immutable.Stack([initial])
                    if not x.editing
                        x.editing = {}
                    v[x.date - 0] = x

                actions.setState(messages : immutable.fromJS(v))
                syncdb.on('change', actions._syncdb_change)


Message = rclass
    displayName: "Message"

    propTypes:
        message        : rtypes.object.isRequired  # immutable.js message object
        account_id     : rtypes.string.isRequired
        sender_name    : rtypes.string
        editor_name    : rtypes.string
        user_map       : rtypes.object
        project_id     : rtypes.string    # optional -- improves relative links if given
        file_path      : rtypes.string    # optional -- (used by renderer; path containing the chat log)
        font_size      : rtypes.number
        show_avatar    : rtypes.bool
        get_user_name  : rtypes.func
        is_prev_sender : rtypes.bool
        is_next_sender : rtypes.bool
        actions        : rtypes.object
        show_heads     : rtypes.bool

    getInitialState: ->
        edited_message  : @newest_content()
        new_changes     : false

    componentWillReceiveProps: (newProps) ->
        changes = false
        if @state.edited_message == @newest_content()
            @setState(edited_message : newProps.message.get('history')?.peek()?.get('content') ? '')
        else
            changes = true
        @setState(new_changes : changes)

    shouldComponentUpdate: (next, next_state) ->
        return @props.message != next.message or
               @props.user_map != next.user_map or
               @props.account_id != next.account_id or
               @props.show_avatar != next.show_avatar or
               @props.is_prev_sender != next.is_prev_sender or
               @props.is_next_sender != next.is_next_sender or
               @props.editor_name != next.editor_name or
               @state.edited_message != next_state.edited_message or
               ((not @props.is_prev_sender) and (@props.sender_name != next.sender_name))

    #componentWillUnmount: () ->
    #    @props.actions.set_editing(@props.message, false)

    newest_content: ->
        @props.message.get('history').peek()?.get('content') ? ''

    is_editing: ->
        @props.message.get('editing').has(@props.account_id)

    sender_is_viewer: ->
        @props.account_id == @props.message.get('sender_id')

    get_timeago: ->
        <div className="pull-right small" style={color:'#888', marginTop:'-8px', marginBottom:'1px'}>
            <TimeAgo date={new Date(@props.message.get('date'))} />
        </div>

    editing_status: ->
        other_editors = @props.message.get('editing').remove(@props.account_id).keySeq()
        if @is_editing()
            if other_editors.size == 1
                # This user and someone else is also editing
                text = "#{@props.get_user_name(other_editors.first())} is also editing this!"
                color = "#E55435"
            else if other_editors.size > 1
                # Multiple other editors
                text = "#{other_editors.size} other users are also editing this!"
                color = "#E55435"
            else if @state.new_changes
                text = "#{@props.editor_name} has updated this message. Esc to discard your changes and see theirs"
                color = "#E55435"
            else
                text = "You are now editing ... Shift+Enter to submit changes."
        else
            if other_editors.size == 1
                # One person is editing
                text = "#{@props.get_user_name(other_editors.first())} is editing this message"
            else if other_editors.size > 1
                # Multiple editors
                text = "#{other_editors.size} people are editing this message"
            else if @newest_content() == ''
                text = "Deleted by #{@props.editor_name}"

        text ?= "Last edit by #{@props.editor_name}"
        color ?= "#888"

        <div className="pull-left small" style={color:color, marginTop:'-8px', marginBottom:'1px'}>
            {text}
        </div>

    show_user_name: ->
        <div className={"small"} style={color:"#888", marginBottom:'1px', marginLeft:'10px'}>
            {@props.sender_name}
        </div>

    avatar_column: ->
        account = @props.user_map?.get(@props.message.get('sender_id'))?.toJS()
        if @props.is_prev_sender
            margin_top = '5px'
        else
            margin_top = '27px'

        if @sender_is_viewer()
            textAlign = 'left'
            marginRight = '11px'
        else
            textAlign = 'right'
            marginLeft = '11px'

        style =
            display       : "inline-block"
            marginTop     : margin_top
            marginLeft    : marginLeft
            marginRight   : marginRight
            padding       : '0px'
            textAlign     : textAlign
            verticalAlign : "middle"
            width         : '4%'

        # TODO: do something better when we don't know the user (or when sender account_id is bogus)
        <Col key={0} xsHidden={true} sm={1} style={style} >
            <div>
                {<Avatar account={account} /> if account? and @props.show_avatar}
            </div>
        </Col>

    content_column: ->
        value = @newest_content()
        if @sender_is_viewer()
            color = '#f5f5f5'
        else
            color = '#fff'

        # smileys, just for fun.
        value = misc.smiley
            s: value
            wrap: ['<span class="smc-editor-chat-smiley">', '</span>']
        value = misc_page.sanitize_html(value)

        font_size = "#{@props.font_size}px"

        if @props.show_avatar
            marginBottom = "1vh"
        else
            marginBottom = "3px"

        if not @props.is_prev_sender and @sender_is_viewer()
            marginTop = "17px"

        if not @props.is_prev_sender and not @props.is_next_sender
            borderRadius = '10px 10px 10px 10px'
        else if not @props.is_prev_sender
            borderRadius = '10px 10px 5px 5px'
        else if not @props.is_next_sender
            borderRadius = '5px 5px 10px 10px'

        <Col key={1} xs={10} sm={9}>
            {@show_user_name() if not @props.is_prev_sender and not @sender_is_viewer()}
            <Panel style={background:color, wordWrap:"break-word", marginBottom: marginBottom, marginTop: marginTop, borderRadius: borderRadius}>
                <ListGroup fill>
                    <ListGroupItem onDoubleClick={@edit_message} style={background:color, fontSize: font_size, borderRadius: borderRadius}>
                        {@render_markdown(value) if not @is_editing()}
                        {@render_input() if @is_editing()}
                        {@editing_status() if @props.message.get('history').size > 1 or  @props.message.get('editing').size > 0}
                        {@get_timeago()}
                    </ListGroupItem>
                </ListGroup>
            </Panel>
        </Col>

    render_markdown: (value) ->
        <div style={paddingBottom: '1px', marginBottom: '5px'}>
            <Markdown value={value}
                      project_id={@props.project_id}
                      file_path={@props.file_path} />
        </div>

    # TODO: Make this a codemirror input
    render_input: ->
        <div>
            <Input
                autoFocus = {true}
                rows      = 4
                type      = 'textarea'
                ref       = 'editedMessage'
                onKeyDown = {@on_keydown}
                value     = {@state.edited_message}
                onChange  = {=>@setState(edited_message: @refs.editedMessage.getValue())}
                onFocus   = {@focus_endpoint}
                />
        </div>

    on_keydown : (e) ->
        if e.keyCode==27 # ESC
            e.preventDefault()
            @setState
                edited_message : @newest_content()
            @props.actions.set_editing(@props.message, false)
        else if e.keyCode==13 and e.shiftKey # 13: enter key
            mesg = @refs.editedMessage.getValue()
            if mesg != @newest_content()
                @props.actions.send_edit(@props.message, mesg)
            else
                @props.actions.set_editing(@props.message, false)

    edit_message: ->
        @props.actions.set_editing(@props.message, true)

    focus_endpoint: (e) ->
        val = e.target.value
        e.target.value = ''
        e.target.value = val

    blank_column:  ->
        <Col key={2} xs={2}></Col>

    render: ->
        if @props.include_avatar_col
            cols = [@avatar_column(), @content_column(), @blank_column()]
            # mirror right-left for sender's view
            if @sender_is_viewer()
                cols = cols.reverse()
            <Row>
                {cols}
            </Row>
        else
            cols = [@content_column(), @blank_column()]
            # mirror right-left for sender's view
            if @sender_is_viewer()
                cols = cols.reverse()
            <Row>
                {cols}
            </Row>

ChatLog = rclass
    displayName: "ChatLog"

    propTypes:
        messages     : rtypes.object.isRequired   # immutable js map {timestamps} --> message.
        user_map     : rtypes.object              # immutable js map {collaborators} --> account info
        account_id   : rtypes.string
        project_id   : rtypes.string   # optional -- used to render links more effectively
        file_path    : rtypes.string   # optional -- ...
        font_size    : rtypes.number
        actions      : rtypes.object
        show_heads   : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.messages != next.messages or @props.user_map != next.user_map or @props.account_id != next.account_id

    get_user_name: (account_id) ->
        account = @props.user_map?.get(account_id)
        if account?
            account_name = account.get('first_name') + ' ' + account.get('last_name')
        else
            account_name = "Unknown"

    list_messages: ->
        is_next_message_sender = (index, dates, messages) ->
            if index + 1 == dates.length
                return false
            current_message = messages.get(dates[index])
            next_message = messages.get(dates[index + 1])
            return current_message.get('sender_id') == next_message.get('sender_id')

        is_prev_message_sender = (index, dates, messages) ->
            if index == 0
                return false
            current_message = messages.get(dates[index])
            prev_message = messages.get(dates[index - 1])
            return current_message.get('sender_id') == prev_message.get('sender_id')

        sorted_dates = @props.messages.keySeq().sort(misc.cmp_Date).toJS()
        v = []
        for date, i in sorted_dates
            sender_name = @get_user_name(@props.messages.get(date)?.get('sender_id'))
            last_editor_name = @get_user_name(@props.messages.get(date)?.get('history').peek()?.get('author_id'))

            v.push <Message key={date}
                     account_id       = {@props.account_id}
                     user_map         = {@props.user_map}
                     message          = {@props.messages.get(date)}
                     project_id       = {@props.project_id}
                     file_path        = {@props.file_path}
                     font_size        = {@props.font_size}
                     is_prev_sender   = {is_prev_message_sender(i, sorted_dates, @props.messages)}
                     is_next_sender   = {is_next_message_sender(i, sorted_dates, @props.messages)}
                     show_avatar      = {@props.show_heads and not is_next_message_sender(i, sorted_dates, @props.messages)}
                     include_avatar_col = {@props.show_heads}
                     get_user_name    = {@get_user_name}
                     sender_name      = {sender_name}
                     editor_name      = {last_editor_name}
                     actions          = {@props.actions}
                    />

        return v

    render: ->
        <div>
            {@list_messages()}
        </div>

ChatRoom = (name) -> rclass
    displayName: "ChatRoom"

    reduxProps :
        "#{name}" :
            messages       : rtypes.immutable
            input          : rtypes.string
            saved_position : rtypes.number
            height         : rtypes.number
            offset         : rtypes.number
        users :
            user_map : rtypes.immutable
        account :
            account_id : rtypes.string
            font_size  : rtypes.number
        file_use :
            file_use : rtypes.immutable

    propTypes :
        redux       : rtypes.object
        actions     : rtypes.object
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        file_use_id : rtypes.string.isRequired
        path        : rtypes.string

    getInitialState: ->
        input : ''

    mark_as_read: ->
        @props.redux.getActions('file_use').mark_file(@props.project_id, @props.path, 'read')

    keydown : (e) ->
        # TODO: Add timeout component to is_typing
        if e.keyCode==27 # ESC
            e.preventDefault()
            @clear_input()
        else if e.keyCode==13 and e.shiftKey # 13: enter key
            @send_chat(e)
        else if e.keyCode==38 and @refs.input.getValue() == ''
            # Up arrow on an empty input
            @props.actions.set_to_last_input()

    send_chat: (e) ->
        @scroll_to_bottom()
        e.preventDefault()
        mesg = @refs.input.getValue()
        # block sending empty messages
        if mesg.length? and mesg.trim().length >= 1
            @props.actions.send_chat(mesg)
            @clear_input()

    clear_input: ->
        @props.actions.set_input('')

    render_bottom_tip: ->
        tip = <span>
            You may enter (Github flavored) markdown here and include Latex mathematics in $ signs.  In particular, use # for headings, > for block quotes, *'s for italic text, **'s for bold text, - at the beginning of a line for lists, back ticks ` for code, and URL's will automatically become links.   Press shift+enter to send your chat. Double click to edit past chats.
        </span>

        <Tip title='Use Markdown' tip={tip}>
            Shift+Enter to send your message.
            Double click chat bubbles to edit them.
            Format using <a href='https://help.github.com/articles/markdown-basics/' target='_blank'>Markdown</a>.
            Emoticons: {misc.emoticons}.
        </Tip>

    chat_log_style:
        overflowY    : "auto"
        overflowX    : "hidden"
        height       : "60vh"
        margin       : "0"
        padding      : "0"
        paddingRight : "10px"

    chat_input_style:
        margin       : "0"
        padding      : "4px 7px 4px 7px"
        marginTop    : "5px"

    mobile_chat_log_style:
        overflowY    : "auto"
        overflowX    : "hidden"
        height       : "60vh"
        margin       : "0"
        padding      : "0"

    mobile_chat_input_style:
        margin       : "0"
        padding      : "4px 7px 4px 7px"
        marginTop    : "5px"

    is_at_bottom: ->
        # 20 for covering margin of bottom message
        @props.saved_position + @props.offset + 20 > @props.height

    scroll_to_bottom: ->
        if @refs.log_container?
            node = ReactDOM.findDOMNode(@refs.log_container)
            node.scrollTop = node.scrollHeight
            @props.actions.save_scroll_state(node.scrollTop, node.scrollHeight, node.offsetHeight)
            @_use_saved_position = false

    scroll_to_position: ->
        if @refs.log_container?
            @_use_saved_position = not @is_at_bottom()
            node = ReactDOM.findDOMNode(@refs.log_container)
            if @_use_saved_position
                node.scrollTop = @props.saved_position
            else
                @scroll_to_bottom()

    on_scroll: (e) ->
        @_use_saved_position = true
        node = ReactDOM.findDOMNode(@refs.log_container)
        @props.actions.save_scroll_state(node.scrollTop, node.scrollHeight, node.offsetHeight)
        e.preventDefault()

    componentDidMount: ->
        @scroll_to_position()

    componentWillReceiveProps: (next) ->
        if @props.messages != next.messages and @is_at_bottom()
            @_use_saved_position = false

    componentDidUpdate: ->
        if not @_use_saved_position
            @scroll_to_bottom()

    show_files : ->
        @props.redux?.getProjectActions(@props.project_id).set_focused_page('project-file-listing')

    show_timetravel: ->
        @props.redux?.getProjectActions(@props.project_id).open_file
            path               : misc.history_path(@props.path)
            foreground         : true
            foreground_project : true

    render : ->
        if not @props.messages? or not @props.redux?
            return <Loading/>
        if not IS_MOBILE
            <Grid>
                <Row style={marginBottom:'5px'}>
                    <Col xs={2} mdHidden >
                        <Button className='smc-small-only'
                                onClick={@show_files}>
                                <Icon name='toggle-up'/> Files
                        </Button>
                    </Col>
                    <Col xs={4} md={6} style={padding:'0px'}>
                        <UsersViewingDocument
                              file_use_id = {@props.file_use_id}
                              file_use    = {@props.file_use}
                              account_id  = {@props.account_id}
                              user_map    = {@props.user_map} />
                    </Col>
                    <Col xs={6} md={6} className="pull-right" style={padding:'2px', textAlign:'right'}>
                        <ButtonGroup>
                            <Button onClick={@show_timetravel} bsStyle='info'>
                                <Icon name='history'/> TimeTravel
                            </Button>
                            <Button onClick={@scroll_to_bottom}>
                                <Icon name='arrow-down'/> Scroll to Bottom
                            </Button>
                        </ButtonGroup>
                    </Col>
                </Row>
                <Row>
                    <Col md={12} style={padding:'0px 2px 0px 2px'}>
                        <Panel style={@chat_log_style} ref='log_container' onScroll={@on_scroll} >
                            <ChatLog
                                messages     = {@props.messages}
                                account_id   = {@props.account_id}
                                user_map     = {@props.user_map}
                                project_id   = {@props.project_id}
                                font_size    = {@props.font_size}
                                file_path    = {if @props.path? then misc.path_split(@props.path).head}
                                actions      = {@props.actions}
                                show_heads   = true />
                        </Panel>
                    </Col>
                </Row>
                <Row>
                    <Col xs={10} md={11} style={padding:'0px 2px 0px 2px'}>
                        <Input
                            autoFocus   = {true}
                            rows        = 4
                            type        = 'textarea'
                            ref         = 'input'
                            onKeyDown   = {@keydown}
                            value       = {@props.input}
                            placeholder = {'Type a message...'}
                            onClick     = {@mark_as_read}
                            onChange    = {(value)=>@props.actions.set_input(@refs.input.getValue())}
                            style       = {@chat_input_style}
                            />
                    </Col>
                    <Col xs={2} md={1} style={height:'98.6px', padding:'0px 2px 0px 2px'}>
                        <Button onClick={@send_chat} disabled={@props.input==''} bsStyle='primary' style={height:'90%', width:'100%', marginTop:'5px'}>Send</Button>
                    </Col>
                </Row>
                <Row>
                    <Col md={12}>
                        {@render_bottom_tip()}
                    </Col>
                </Row>
            </Grid>

        else
        ##########################################
        # MOBILE HACK
        ##########################################
            <Grid>
                <Row style={marginBottom:'5px'}>
                    <Col xs={3} style={padding:'0px'}>
                        <UsersViewingDocument
                              file_use_id = {@props.file_use_id}
                              file_use    = {@props.file_use}
                              account_id  = {@props.account_id}
                              user_map    = {@props.user_map} />
                    </Col>
                    <Col xs={9} style={padding:'2px', textAlign:'right'}>
                        <ButtonGroup>
                            <Button onClick={@show_timetravel} bsStyle='info'>
                                <Icon name='history'/> TimeTravel
                            </Button>
                            <Button onClick={@scroll_to_bottom}>
                                <Icon name='arrow-down'/> Scroll to Bottom
                            </Button>
                        </ButtonGroup>
                    </Col>
                </Row>
                <Row>
                    <Col md={12} style={padding:'0px 2px 0px 2px'}>
                        <Panel style={@mobile_chat_log_style} ref='log_container' onScroll={@on_scroll} >
                            <ChatLog
                                messages     = {@props.messages}
                                account_id   = {@props.account_id}
                                user_map     = {@props.user_map}
                                project_id   = {@props.project_id}
                                font_size    = {@props.font_size}
                                file_path    = {if @props.path? then misc.path_split(@props.path).head}
                                actions      = {@props.actions}
                                show_heads   = {false} />
                        </Panel>
                    </Col>
                </Row>
                <Row>
                    <Col xs={10} style={padding:'0px 2px 0px 2px'}>
                        <Input
                            autoFocus   = {false}
                            rows        = 2
                            type        = 'textarea'
                            ref         = 'input'
                            onKeyDown   = {@keydown}
                            value       = {@props.input}
                            placeholder = {'Type a message...'}
                            onClick     = {@mark_as_read}
                            onChange    = {(value)=>@props.actions.set_input(@refs.input.getValue())}
                            style       = {@mobile_chat_input_style}
                            />
                    </Col>
                    <Col xs={2} style={height:'57px', padding:'0px 2px 0px 2px'}>
                        <Button onClick={@send_chat} disabled={@props.input==''} bsStyle='primary' style={height:'90%', width:'100%', marginTop:'5px'}>
                            <Icon name='chevron-circle-right'/>
                        </Button>
                    </Col>
                </Row>
            </Grid>

# boilerplate fitting this into SMC below

render = (redux, project_id, path) ->
    name = redux_name(project_id, path)
    file_use_id = require('smc-util/schema').client_db.sha1(project_id, path)
    C = ChatRoom(name)
    <Redux redux={redux}>
        <C redux={redux} actions={redux.getActions(name)} name={name} project_id={project_id} path={path} file_use_id={file_use_id} />
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


