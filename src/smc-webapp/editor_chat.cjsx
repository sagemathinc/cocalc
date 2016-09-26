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
AUTHORS:

  - William Stein
  - Harald Schilly
  - Simon Luu
  - John Jeng
###

###
Chat message JSON format:

sender_id : String which is the original message sender's account id
event     : Can only be "chat" right now.
date      : A date string
history   : Array of "History" objects (described below)
editing   : Object of <account id's> : <"FUTURE">

"FUTURE" Will likely contain their last edit in the future

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
"date":"2016-07-23T23:10:04.837Z","editing":{"07b12853-07e5-487f-906a-d7ae04536540":"FUTURE"}}
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
underscore = require('underscore')

# SMC libraries
{Avatar, UsersViewing} = require('./profile')
misc = require('smc-util/misc')
misc_page = require('./misc_page')
{defaults, required} = misc
{Markdown, TimeAgo, Tip} = require('./r_misc')
{salvus_client} = require('./salvus_client')
{synchronized_db} = require('./syncdb')

{alert_message} = require('./alerts')

# React libraries
{React, ReactDOM, rclass, rtypes, Actions, Store, redux}  = require('./smc-react')
{Icon, Loading, TimeAgo} = require('./r_misc')
{Button, Col, Grid, FormControl, FormGroup, ListGroup, ListGroupItem, Panel, Row, ButtonGroup} = require('react-bootstrap')

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
            # WARNING: give an error or try again later?
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

        @syncdb.save()
        @setState(last_sent: mesg)

    set_editing: (message, is_editing) =>
        if not @syncdb?
            # WARNING: give an error or try again later?
            return
        author_id = @redux.getStore('account').get_account_id()

        if is_editing
            # FUTURE: Save edit changes
            editing = message.get('editing').set(author_id, 'FUTURE')
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

    # Used to edit sent messages.
    # Inefficient. Assumes number of edits is small.
    send_edit: (message, mesg) =>
        if not @syncdb?
            # WARNING: give an error or try again later?
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

    saved_message: (saved_mesg) =>
        @setState(saved_mesg:saved_mesg)

    set_is_preview: (is_preview) =>
        @setState(is_preview:is_preview)

    save_scroll_state: (position, height, offset) =>
        # height == 0 means chat room is not rendered
        if height != 0
            @setState(saved_position:position, height:height, offset:offset)

# boilerplate setting up actions, stores, sync'd file, etc.
syncdbs = {}
init_redux = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, ChatActions)
    store   = redux.createStore(name, {input:''})

    synchronized_db
        project_id    : project_id
        filename      : path
        sync_interval : 0
        cb            : (err, syncdb) ->
            if err
                alert_message(type:'error', message:"unable to open #{@path}")
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

    return name

remove_redux = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    store = redux.getStore(name)
    if not store?
        return
    store.syncdb?.destroy()
    delete store.state
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    redux.removeStore(name)
    redux.removeActions(name)
    return name

Message = rclass
    displayName: "Message"

    propTypes:
        message        : rtypes.immutable.Map.isRequired  # immutable.js message object
        history        : rtypes.array
        history_author : rtypes.array
        history_date   : rtypes.array
        account_id     : rtypes.string.isRequired
        date           : rtypes.string
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
        focus_end      : rtypes.func
        saved_mesg     : rtypes.string
        close_input    : rtypes.func

    getInitialState: ->
        edited_message  : @newest_content()
        history_size    : @props.message.get('history').size
        show_history    : false
        new_changes     : false

    componentWillReceiveProps: (newProps) ->
        if @state.history_size != @props.message.get('history').size
            @setState(history_size:@props.message.get('history').size)
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
               @props.saved_mesg != next.saved_mesg or
               @state.edited_message != next_state.edited_message or
               @state.show_history != next_state.show_history or
               ((not @props.is_prev_sender) and (@props.sender_name != next.sender_name))

    componentDidMount: ->
        if @refs.editedMessage
            @setState(edited_message:@props.saved_mesg)

    componentDidUpdate: ->
        if @refs.editedMessage
            @props.actions.saved_message(ReactDOM.findDOMNode(@refs.editedMessage).value)

    newest_content: ->
        @props.message.get('history').peek()?.get('content') ? ''

    sender_is_viewer: ->
        @props.account_id == @props.message.get('sender_id')

    get_timeago: ->
        <div className="pull-right small" style={color:'#888'}>
            <TimeAgo date={new Date(@props.message.get('date'))} />
        </div>

    show_history: ->
        #No history for mobile, since right now messages in mobile are too clunky
        if not IS_MOBILE
            <div className="pull-left small" style={color:'#888', marginLeft:'10px', cursor:'pointer'} onClick={@enable_history}>
                <Tip title='Message History' tip='Show history of editing of this message.'>
                    <Icon name='history'/>
                </Tip>
            </div>

    hide_history: ->
        #No history for mobile, since right now messages in mobile are too clunky
        if not IS_MOBILE
            <div className="pull-left small"
                 style={color:'#888', marginLeft:'10px', cursor:'pointer'}
                 onClick={@disable_history} >
                <Tip title='Message History' tip='Hide history of editing of this message.'>
                    <Icon name='history'/> Hide History
                </Tip>
            </div>

    disable_history: ->
        @setState(show_history:false)
        @props.set_scroll()

    enable_history: ->
        @setState(show_history:true)
        @props.set_scroll()

    show_user_name: ->
        <div className={"small"} style={color:"#888", marginBottom:'1px', marginLeft:'10px'}>
            {@props.sender_name}
        </div>

    is_editing: ->
        @props.message.get('editing').has(@props.account_id)

    editing_status: ->
        other_editors = @props.message.get('editing').remove(@props.account_id).keySeq()
        current_user = @props.user_map.get(@props.account_id).get('first_name') + ' ' + @props.user_map.get(@props.account_id).get('last_name')
        if @is_editing()
            if other_editors.size == 1
                # This user and someone else is also editing
                text = "#{@props.get_user_name(other_editors.first())} is also editing this!"
                color = "#E55435"
            else if other_editors.size > 1
                # Multiple other editors
                text = "#{other_editors.size} other users are also editing this!"
                color = "#E55435"
            else if @state.history_size != @props.message.get('history').size and @state.new_changes
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
            else if @newest_content().trim() == ''
                text = "Deleted by #{@props.editor_name}"

        text ?= "Last edit by #{@props.editor_name}"
        color ?= "#888"

        if not @is_editing() and other_editors.size == 0 and @newest_content().trim() != ''
            edit = "Last edit "
            name = " by #{@props.editor_name}"
            <div className="pull-left small" style={color:color}>
                {edit}
                <TimeAgo date={new Date(@props.message.get('history').peek()?.get('date'))} />
                {name}
            </div>
        else
            <div className="pull-left small" style={color:color}>
                {text}
            </div>

    edit_message: ->
        @props.actions.set_editing(@props.message, true)
        @props.close_input(@props.date, @props.account_id, @props.saved_mesg)

    on_keydown : (e) ->
        if e.keyCode==27 # ESC
            e.preventDefault()
            @setState
                edited_message : @newest_content()
            @props.actions.set_editing(@props.message, false)
        else if e.keyCode==13 and e.shiftKey # 13: enter key
            mesg = ReactDOM.findDOMNode(@refs.editedMessage).value
            if mesg != @newest_content()
                @props.actions.send_edit(@props.message, mesg)
            else
                @props.actions.set_editing(@props.message, false)

    # All the columns
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

        # FUTURE: do something better when we don't know the user (or when sender account_id is bogus)
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

        if not @props.is_prev_sender and not @props.is_next_sender and not @state.show_history
            borderRadius = '10px 10px 10px 10px'
        else if not @props.is_prev_sender
            borderRadius = '10px 10px 5px 5px'
        else if not @props.is_next_sender
            borderRadius = '5px 5px 10px 10px'

        <Col key={1} xs={10} sm={9}>
            {@show_user_name() if not @props.is_prev_sender and not @sender_is_viewer()}
            <Panel style={background:color, wordWrap:"break-word", marginBottom: "3px", marginTop: marginTop, borderRadius: borderRadius}>
                <ListGroup fill>
                    <ListGroupItem onDoubleClick={@edit_message} style={background:color, fontSize: font_size, borderRadius: borderRadius, paddingBottom:'20px'}>
                        {@render_markdown(value) if not @is_editing()}
                        {@render_input() if @is_editing()}
                        {@editing_status() if @props.message.get('history').size > 1 or  @props.message.get('editing').size > 0}
                        {@show_history() if not @state.show_history and @props.message.get('history').size > 1}
                        {@hide_history() if @state.show_history and @props.message.get('history').size > 1}
                        {@get_timeago()}
                    </ListGroupItem>
                    <div></div>  {#This div tag fixes a weird bug where <li> tags would be rendered below the <ListGroupItem>}
                </ListGroup>
            </Panel>
            {@render_history_title(color, font_size) if @state.show_history}
            {@render_history(color, font_size) if @state.show_history}
            {@render_history_footer(color, font_size) if @state.show_history}
        </Col>

    blank_column:  ->
        <Col key={2} xs={2} sm={2}></Col>

    # All the render methods
    render_markdown: (value) ->
        <div style={paddingBottom: '1px', marginBottom: '5px'}>
            <Markdown value={value}
                      project_id={@props.project_id}
                      file_path={@props.file_path} />
        </div>

    render_history_title: (color, font_size) ->
        <ListGroupItem style={background:color, fontSize: font_size, borderRadius: '10px 10px 0px 0px', textAlign:'center'}>
            <span style={fontStyle: 'italic', fontWeight: 'bold'}>Message History</span>
        </ListGroupItem>

    render_history_footer: (color, font_size) ->
        <ListGroupItem style={background:color, fontSize: font_size, borderRadius: '0px 0px 10px 10px', marginBottom: '3px'}>
        </ListGroupItem>

    render_history: (color, font_size) ->
        for date of @props.history and @props.history_author and @props.history_date
            value = @props.history[date]
            value = misc.smiley
                s: value
                wrap: ['<span class="smc-editor-chat-smiley">', '</span>']
            value = misc_page.sanitize_html(value)
            author = @props.user_map.get(@props.history_author[date]).get('first_name') + ' ' + @props.user_map.get(@props.history_author[date]).get('last_name')
            if @props.history[date].trim() == ''
                text = "Message deleted "
            else
                text = "Last edit "
            <ListGroupItem key={date} style={background:color, fontSize: font_size, paddingBottom:'20px'}>
                <div style={paddingBottom: '1px', marginBottom: '5px', wordWrap:'break-word'}>
                    <Markdown value={value}/>
                </div>
                <div className="pull-left small" style={color:'#888'}>
                    {text}
                    <TimeAgo date={new Date(@props.history_date[date])} />
                    {' by ' + author}
                </div>
            </ListGroupItem>

    # FUTURE: Make this a codemirror input
    render_input: ->
        <div>
            <FormGroup>
                <FormControl
                    autoFocus = {true}
                    rows      = 4
                    componentClass = 'textarea'
                    ref       = 'editedMessage'
                    onKeyDown = {@on_keydown}
                    value     = {@state.edited_message}
                    onChange  = {=>@setState(edited_message: ReactDOM.findDOMNode(@refs.editedMessage).value)}
                    onFocus   = {@props.focus_end} />
            </FormGroup>
        </div>

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
        focus_end    : rtypes.func
        saved_mesg   : rtypes.string
        set_scroll   : rtypes.func

    shouldComponentUpdate: (next) ->
        return @props.messages != next.messages or
               @props.user_map != next.user_map or
               @props.account_id != next.account_id or
               @props.saved_mesg != next.saved_mesg

    get_user_name: (account_id) ->
        account = @props.user_map?.get(account_id)
        if account?
            account_name = account.get('first_name') + ' ' + account.get('last_name')
        else
            account_name = "Unknown"

    close_edit_inputs: (current_message_date, id, saved_message) ->
        sorted_dates = @props.messages.keySeq().sort(misc.cmp_Date).toJS()
        for date in sorted_dates
            historyContent = @props.messages.get(date).get('history').peek()?.get('content') ? ''
            if date != current_message_date and @props.messages.get(date).get('editing')?.has(id)
                if historyContent != saved_message
                    @props.actions.send_edit(@props.messages.get(date), saved_message)
                else
                    @props.actions.set_editing(@props.messages.get(date), false)

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
            historyList = @props.messages.get(date).get('history').pop().toJS()
            h = []
            a = []
            t = []
            for j of historyList
                h.push(historyList[j].content)
                a.push(historyList[j].author_id)
                t.push(historyList[j].date)

            sender_name = @get_user_name(@props.messages.get(date)?.get('sender_id'))
            last_editor_name = @get_user_name(@props.messages.get(date)?.get('history').peek()?.get('author_id'))

            v.push <Message key={date}
                     account_id       = {@props.account_id}
                     history          = {h}
                     history_author   = {a}
                     history_date     = {t}
                     user_map         = {@props.user_map}
                     message          = {@props.messages.get(date)}
                     date             = {date}
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
                     focus_end        = {@props.focus_end}
                     saved_mesg       = {@props.saved_mesg}
                     close_input      = {@close_edit_inputs}
                     set_scroll       = {@props.set_scroll}
                    />

        return v

    render: ->
        <div>
            {@list_messages()}
        </div>

ChatRoom = rclass ({name}) ->
    displayName: "ChatRoom"

    reduxProps :
        "#{name}" :
            messages       : rtypes.immutable.Map
            input          : rtypes.string
            saved_position : rtypes.number
            height         : rtypes.number
            offset         : rtypes.number
            saved_mesg     : rtypes.string
            is_preview     : rtypes.bool
        users :
            user_map : rtypes.immutable.Map
        account :
            account_id : rtypes.string
            font_size  : rtypes.number
        file_use :
            file_use : rtypes.immutable.Map

    propTypes :
        redux       : rtypes.object.isRequired
        actions     : rtypes.object.isRequired
        project_id  : rtypes.string.isRequired
        file_use_id : rtypes.string.isRequired
        path        : rtypes.string.isRequired

    getInitialState : ->
        input          : ''
        preview        : ''

    componentWillMount: ->
        @set_preview_state = underscore.debounce(@set_preview_state, 500)
        @set_chat_log_state = underscore.debounce(@set_chat_log_state, 10)
        @debounce_bottom = underscore.debounce(@debounce_bottom, 10)

    componentDidMount: ->
        @scroll_to_position()
        if @props.is_preview
            if @is_at_bottom()
                @debounce_bottom()
        else
            @props.actions.set_is_preview(false)

    componentWillReceiveProps: (next) ->
        if (@props.messages != next.messages or @props.input != next.input) and @is_at_bottom()
            @_use_saved_position = false

    componentDidUpdate: ->
        if not @_use_saved_position
            @scroll_to_bottom()

    mark_as_read: ->
        @props.redux.getActions('file_use').mark_file(@props.project_id, @props.path, 'read')

    keydown : (e) ->
        # FUTURE: Add timeout component to is_typing
        if e.keyCode==27 # ESC
            e.preventDefault()
            @clear_input()
        else if e.keyCode==13 and e.shiftKey # 13: enter key
            @send_chat(e)
        else if e.keyCode==38 and ReactDOM.findDOMNode(@refs.input).value == ''
            # Up arrow on an empty input
            @props.actions.set_to_last_input()

    focus_endpoint: (e) ->
        val = e.target.value
        e.target.value = ''
        e.target.value = val

    send_chat: (e) ->
        @scroll_to_bottom()
        # turns off preview
        @button_off_click()
        e.preventDefault()
        mesg = ReactDOM.findDOMNode(@refs.input).value
        # block sending empty messages
        if mesg.length? and mesg.trim().length >= 1
            @props.actions.send_chat(mesg)
            @clear_input()

    clear_input: ->
        @props.actions.set_input('')

    button_off_click: ->
        @props.actions.set_is_preview(false)
        ReactDOM.findDOMNode(@refs.input).focus()

    button_on_click: ->
        @props.actions.set_is_preview(true)
        ReactDOM.findDOMNode(@refs.input).focus()
        if @is_at_bottom()
            @scroll_to_bottom()

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

    preview_style:
        background   : '#f5f5f5'
        fontSize     : '14px'
        borderRadius : '10px 10px 10px 10px'
        boxShadow    : '#666 3px 3px 3px'
        paddingBottom: '20px'

    is_at_bottom: ->
        # 20 for covering margin of bottom message
        @props.saved_position + @props.offset + 20 > @props.height

    set_chat_log_state: ->
        if @refs.log_container?
            node = ReactDOM.findDOMNode(@refs.log_container)
            @props.actions.save_scroll_state(node.scrollTop, node.scrollHeight, node.offsetHeight)

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

    set_preview_state: ->
        if @refs.log_container?
            @setState(preview:@props.input)
        if @refs.preview
            node = ReactDOM.findDOMNode(@refs.preview)
            @_preview_height = node.offsetHeight - 12 # sets it to 75px starting then scales with height.

    debounce_bottom: ->
        #debounces it so that the preview shows up then calls
        @scroll_to_bottom()

    show_files : ->
        @props.redux?.getProjectActions(@props.project_id).set_active_tab('files')

    show_timetravel: ->
        @props.redux?.getProjectActions(@props.project_id).open_file
            path               : misc.history_path(@props.path)
            foreground         : true
            foreground_project : true

    # All render methods
    render_bottom_tip: ->
        tip = <span>
            You may enter (Github flavored) markdown here and include Latex mathematics in $ signs.  In particular, use # for headings, > for block quotes, *'s for italic text, **'s for bold text, - at the beginning of a line for lists, back ticks ` for code, and URL's will automatically become links.   Press shift+enter to send your chat. Double click to edit past chats.
        </span>

        <Tip title='Use Markdown' tip={tip}>
            <div style={color: '#767676', fontSize: '12.5px'}>
                Shift+Enter to send your message.
                Double click chat bubbles to edit them.
                Format using <a href='https://help.github.com/articles/markdown-basics/' target='_blank'>Markdown</a>.
                Emoticons: {misc.emoticons}.
            </div>
        </Tip>

    render_preview_message: ->
        @set_preview_state()
        if @state.preview.length > 0
            value = @state.preview
            value = misc.smiley
                s: value
                wrap: ['<span class="smc-editor-chat-smiley">', '</span>']
            value = misc_page.sanitize_html(value)

            <Row ref="preview" style={position:'absolute', bottom:'0px', width:'97.2%'}>
                <Col xs={0} sm={2}></Col>

                <Col xs={10} sm={9}>
                    <ListGroup fill>
                        <ListGroupItem style={@preview_style}>
                            <div className="pull-right lighten" style={marginRight: '-10px', marginTop: '-10px', cursor:'pointer', fontSize:'13pt'} onClick={@button_off_click}>
                                <Icon name='times'/>
                            </div>
                            <div style={paddingBottom: '1px', marginBottom: '5px', wordWrap:'break-word'}>
                                <Markdown value={value}/>
                            </div>
                            <div className="pull-right small lighten">
                                Preview (press Shift+Enter to send)
                            </div>
                        </ListGroupItem>
                        <div></div>  {#This div tag fixes a weird bug where <li> tags would be rendered below the <ListGroupItem>}
                    </ListGroup>
                </Col>

                <Col sm={1}></Col>
            </Row>

    render_timetravel_button: ->
        tip = <span>
            Browse all versions of this chatroom.
        </span>

        <Button onClick={@show_timetravel} bsStyle='info'>
            <Tip title='TimeTravel Button' tip={tip}  placement='left'>
                <Icon name='history'/> TimeTravel
            </Tip>
        </Button>

    render_bottom_button: ->
        tip = <span>
            Scrolls the chat to the bottom
        </span>

        <Button onClick={@scroll_to_bottom}>
            <Tip title='Scroll to Bottom Button' tip={tip}  placement='left'>
                <Icon name='arrow-down'/> Bottom
            </Tip>
        </Button>

    render : ->
        if not @props.messages? or not @props.redux?
            return <Loading/>

        if @props.input.length > 0 and @props.is_preview and @refs.preview
            paddingBottom = "#{@_preview_height}px"
        else
            paddingBottom = '0px'

        chat_log_style =
            overflowY    : "auto"
            overflowX    : "hidden"
            height       : "60vh"
            margin       : "0"
            padding      : "0"
            paddingRight : "10px"
            paddingBottom: paddingBottom

        if not IS_MOBILE
            <div style={padding:"7px 7px 7px 7px", borderTop: '1px solid rgb(170, 170, 170)'}>
                <Grid>
                    <Row style={marginBottom:'5px'}>
                        <Col xs={2} mdHidden style={paddingLeft:'2px'}>
                            <Button className='smc-small-only'
                                    onClick={@show_files}>
                                    <Icon name='toggle-up'/> Files
                            </Button>
                        </Col>
                        <Col xs={4} md={4} style={padding:'0px'}>
                            <UsersViewing
                                  file_use_id = {@props.file_use_id}
                                  file_use    = {@props.file_use}
                                  account_id  = {@props.account_id}
                                  user_map    = {@props.user_map} />
                        </Col>
                        <Col xs={6} md={6} className="pull-right" style={padding:'2px', textAlign:'right'}>
                            <ButtonGroup>
                                {@render_timetravel_button()}
                                {@render_bottom_button()}
                            </ButtonGroup>
                        </Col>
                    </Row>
                    <Row>
                        <Col md={12} style={padding:'0px 2px 0px 2px'}>
                            <Panel style={chat_log_style} ref='log_container' onScroll={@on_scroll}>
                                <ChatLog
                                    messages     = {@props.messages}
                                    account_id   = {@props.account_id}
                                    user_map     = {@props.user_map}
                                    project_id   = {@props.project_id}
                                    font_size    = {@props.font_size}
                                    file_path    = {if @props.path? then misc.path_split(@props.path).head}
                                    actions      = {@props.actions}
                                    saved_mesg   = {@props.saved_mesg}
                                    focus_end    = {@focus_endpoint}
                                    set_scroll   = {@set_chat_log_state}
                                    show_heads   = true />
                                {@render_preview_message() if @props.input.length > 0 and @props.is_preview}
                            </Panel>
                        </Col>
                    </Row>
                    <Row>
                        <Col xs={10} md={11} style={padding:'0px 2px 0px 2px'}>
                            <FormGroup>
                                <FormControl
                                    autoFocus   = {true}
                                    rows        = 4
                                    componentClass = 'textarea'
                                    ref         = 'input'
                                    onKeyDown   = {@keydown}
                                    value       = {@props.input}
                                    placeholder = {'Type a message...'}
                                    onClick     = {@mark_as_read}
                                    onChange    = {(value)=>@props.actions.set_input(ReactDOM.findDOMNode(@refs.input).value)}
                                    onFocus     = {@focus_endpoint}
                                    style       = {@chat_input_style}
                                    />
                            </FormGroup>
                        </Col>
                        <Col xs={2} md={1} style={height:'98.6px', padding:'0px 2px 0px 2px', marginBottom: '12px'}>
                            <Button onClick={@button_on_click} disabled={@props.input==''} bsStyle='info' style={height:'30%', width:'100%', marginTop:'5px'}>Preview</Button>
                            <Button onClick={@send_chat} disabled={@props.input==''} bsStyle='success' style={height:'60%', width:'100%'}>Send</Button>
                        </Col>
                        {@render_bottom_tip()}
                    </Row>
                </Grid>
            </div>
        else
            ##########################################
            # MOBILE HACK
            ##########################################
            <Grid>
                <Row style={marginBottom:'5px'}>
                    <ButtonGroup>
                        <Button className='smc-small-only'
                            onClick={@show_files}>
                            <Icon name='toggle-up'/> Files
                        </Button>
                        <Button onClick={@scroll_to_bottom}>
                            <Icon name='arrow-down'/> Scroll to Bottom
                        </Button>
                    </ButtonGroup>
                    <UsersViewing
                          file_use_id = {@props.file_use_id}
                          file_use    = {@props.file_use}
                          account_id  = {@props.account_id}
                          user_map    = {@props.user_map} />
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
                                focus_end    = {@focus_endpoint}
                                show_heads   = {false} />
                        </Panel>
                    </Col>
                </Row>
                <Row>
                    <Col xs={10} style={padding:'0px 2px 0px 2px'}>
                        <FormGroup>
                            <FormControl
                                autoFocus   = {false}
                                rows        = 2
                                componentClass = 'textarea'
                                ref         = 'input'
                                onKeyDown   = {@keydown}
                                value       = {@props.input}
                                placeholder = {'Type a message...'}
                                onClick     = {@mark_as_read}
                                onChange    = {(value)=>@props.actions.set_input(ReactDOM.findDOMNode(@refs.input.value))}
                                style       = {@mobile_chat_input_style}
                                />
                        </FormGroup>
                    </Col>
                    <Col xs={2} style={height:'57px', padding:'0px 2px 0px 2px'}>
                        <Button onClick={@send_chat} disabled={@props.input==''} bsStyle='primary' style={height:'90%', width:'100%', marginTop:'5px'}>
                            <Icon name='chevron-circle-right'/>
                        </Button>
                    </Col>
                </Row>
            </Grid>

ChatEditorGenerator = (path, redux, project_id) ->
    # console.log("Generating Chat Editor -- This should happen once per file opening")
    name = redux_name(project_id, path)
    C_ChatRoom = ({path, actions, project_id, redux}) ->
        file_use_id = require('smc-util/schema').client_db.sha1(project_id, path)
        <ChatRoom redux={redux} path={path} name={name} actions={actions} project_id={project_id} file_use_id={file_use_id} />

    C_ChatRoom.redux_name = name

    C_ChatRoom.propTypes =
        redux      : rtypes.object
        path       : rtypes.string.isRequired
        actions    : rtypes.object.isRequired
        project_id : rtypes.string.isRequired

    return C_ChatRoom

require('project_file').register_file_editor
    ext       : 'sage-chat'
    icon      : 'comment'
    init      : init_redux
    generator : ChatEditorGenerator
    remove    : remove_redux