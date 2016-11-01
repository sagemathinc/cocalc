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

# standard non-SMC libraries
immutable = require('immutable')
{IS_MOBILE} = require('./feature')
underscore = require('underscore')

# SMC libraries
{Avatar, UsersViewing} = require('./profile')
misc = require('smc-util/misc')
misc_page = require('./misc_page')
{defaults, required} = misc
{salvus_client} = require('./salvus_client')
{synchronized_db} = require('./syncdb')

{alert_message} = require('./alerts')

# React libraries
{React, ReactDOM, rclass, rtypes, Actions, Store, Redux}  = require('./smc-react')
{Icon, Loading, Markdown, TimeAgo, Tip} = require('./r_misc')
{Button, Col, Grid, FormGroup, FormControl, ListGroup, ListGroupItem, Panel, Row, ButtonGroup, Well} = require('react-bootstrap')

{User} = require('./users')

{redux_name, init_redux, newest_content, sender_is_viewer, get_timeago, show_user_name, is_editing, blank_column, render_markdown, render_history_title, render_history_footer, render_history, get_user_name, send_chat, clear_input, is_at_bottom, scroll_to_bottom, scroll_to_position, focus_endpoint} = require('./editor_chat')

Message = rclass
    displayName: "Message"

    propTypes:
        message        : rtypes.object.isRequired  # immutable.js message object
        history        : rtypes.object
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
        edited_message  : newest_content(@props.message)
        history_size    : @props.message.get('history').size
        show_history    : false
        new_changes     : false

    componentWillReceiveProps: (newProps) ->
        if @state.history_size != @props.message.get('history').size
            @setState(history_size:@props.message.get('history').size)
        changes = false
        if @state.edited_message == newest_content(@props.message)
            @setState(edited_message : newProps.message.get('history')?.peek()?.get('content') ? '')
        else
            changes = true
        @setState(new_changes : changes)

    shouldComponentUpdate: (next, next_state) ->
        return @props.message != next.message or
               @props.user_map != next.user_map or
               @props.account_id != next.account_id or
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

    toggle_history: ->
        #No history for mobile, since right now messages in mobile are too clunky
        if not IS_MOBILE
            if not @state.show_history
                <span className="small" style={color:'#888', marginLeft:'10px', cursor:'pointer'} onClick={=>@toggle_history_side_chat(true)}>
                    <Tip title='Message History' tip='Show history of editing of this message.' placement='left'>
                        <Icon name='history'/>
                    </Tip>
                </span>
            else
                <span className="small"
                        style={color:'#888', marginLeft:'10px', cursor:'pointer'}
                        onClick={=>@toggle_history_side_chat(false)} >
                    <Tip title='Message History' tip='Hide history of editing of this message.' placement='left'>
                        <Icon name='history'/> Hide History
                    </Tip>
                </span>

    toggle_history_side_chat: (bool) ->
        @setState(show_history:bool)

    editing_status: ->
        other_editors = @props.message.get('editing').remove(@props.account_id).keySeq()
        current_user = @props.user_map.get(@props.account_id).get('first_name') + ' ' + @props.user_map.get(@props.account_id).get('last_name')
        if is_editing(@props.message, @props.account_id)
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
            else if newest_content(@props.message).trim() == ''
                text = "Deleted by #{@props.editor_name}"

        text ?= "Last edit by #{@props.editor_name}"
        color ?= "#888"

        if not is_editing(@props.message, @props.account_id) and other_editors.size == 0 and newest_content(@props.message).trim() != ''
            edit = "Last edit "
            name = " by #{@props.editor_name}"
            <span className="small" style={color:color}>
                {edit}
                <TimeAgo date={new Date(@props.message.get('history').peek()?.get('date'))} />
                {name}
            </span>
        else
            <span className="small" style={color:color}>
                {text}
            </span>

    edit_message: ->
        @props.actions.set_editing(@props.message, true)
        @props.close_input(@props.date, @props.account_id, @props.saved_mesg)

    on_keydown : (e) ->
        if e.keyCode==27 # ESC
            e.preventDefault()
            @setState
                edited_message : newest_content(@props.message)
            @props.actions.set_editing(@props.message, false)
        else if e.keyCode==13 and e.shiftKey # 13: enter key
            mesg = ReactDOM.findDOMNode(@refs.editedMessage).value
            if mesg != newest_content(@props.message)
                @props.actions.send_edit(@props.message, mesg)
            else
                @props.actions.set_editing(@props.message, false)

    # All the columns
    content_column: ->
        value = newest_content(@props.message)

        if sender_is_viewer(@props.account_id, @props.message)
            color = '#eee'
        else
            color = '#fff'

        # smileys, just for fun.
        value = misc.smiley
            s: value
            wrap: ['<span class="smc-editor-chat-smiley">', '</span>']


        font_size = "#{@props.font_size}px"

        if not @props.is_prev_sender and sender_is_viewer(@props.account_id, @props.message)
            marginTop = "17px"

        if not @props.is_prev_sender and not @props.is_next_sender and not @state.show_history
            borderRadius = '10px 10px 10px 10px'
        else if not @props.is_prev_sender
            borderRadius = '10px 10px 5px 5px'
        else if not @props.is_next_sender
            borderRadius = '5px 5px 10px 10px'

        message_style =
            background    : color
            wordWrap      : "break-word"
            marginBottom  : "3px"
            borderRadius  : borderRadius

        <Col key={1} xs={11} style={width: "100%"}>
            {show_user_name(@props.sender_name) if not @props.is_prev_sender and not sender_is_viewer(@props.account_id, @props.message)}
            <Well style={message_style} bsSize="small" onDoubleClick = {@edit_message}>
                {get_timeago(@props.message)}
                {render_markdown(value, @props.project_id, @props.file_path) if not is_editing(@props.message, @props.account_id)}
                {@render_input() if is_editing(@props.message, @props.account_id)}
                {@editing_status() if @props.message.get('history').size > 1 or  @props.message.get('editing').size > 0}
                {@toggle_history() if @props.message.get('history').size > 1}
            </Well>
            {render_history_title(color, font_size) if @state.show_history}
            {render_history(color, font_size, @props.history, @props.user_map) if @state.show_history}
            {render_history_footer(color, font_size) if @state.show_history}
        </Col>

    # All the render methods


    # TODO: Make this a codemirror input
    render_input: ->
        <form>
            <FormGroup>
                <FormControl
                    autoFocus = {true}
                    rows      = 4
                    componentClass = 'textarea'
                    ref       = 'editedMessage'
                    onKeyDown = {@on_keydown}
                    value     = {@state.edited_message}
                    onChange  = {(e)=>@setState(edited_message: e.target.value)}
                    onFocus   = {@props.focus_end}
                />
            </FormGroup>
        </form>

    render: ->
        if @props.include_avatar_col
            cols = [@avatar_column(), @content_column(), blank_column()]
            # mirror right-left for sender's view
            if sender_is_viewer(@props.account_id, @props.message)
                cols = cols.reverse()
            <Row>
                {cols}
            </Row>
        else
            cols = [@content_column(), blank_column()]
            # mirror right-left for sender's view
            if sender_is_viewer(@props.account_id, @props.message)
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
            sender_name = get_user_name(@props.messages.get(date)?.get('sender_id'), @props.user_map)
            last_editor_name = get_user_name(@props.messages.get(date)?.get('history').peek()?.get('author_id'), @props.user_map)

            v.push <Message key={date}
                     account_id       = {@props.account_id}
                     history          = {@props.messages.get(date).get('history')}
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
                     get_user_name    = {get_user_name}
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

ChatRoom = (name) -> rclass
    displayName: "ChatRoom"

    reduxProps :
        "#{name}" :
            messages           : rtypes.immutable
            input              : rtypes.string
            saved_position     : rtypes.number
            height             : rtypes.number
            offset             : rtypes.number
            saved_mesg         : rtypes.string
            use_saved_position : rtypes.bool
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
        max_height  : rtypes.number

    getInitialState: ->
        input          : ''

    mobile_chat_input_style:
        margin       : "0"
        padding      : "4px 7px 4px 7px"
        marginTop    : "5px"

    mark_as_read: ->
        @props.redux.getActions('file_use').mark_file(@props.project_id, @props.path, 'read')

    on_keydown : (e) ->
        # TODO: Add timeout component to is_typing
        if e.keyCode==13 and e.shiftKey # 13: enter key
            send_chat(e, @refs.log_container, ReactDOM.findDOMNode(@refs.input).value, @props.actions)
        else if e.keyCode==38 and ReactDOM.findDOMNode(@refs.input).value == ''
            # Up arrow on an empty input
            @props.actions.set_to_last_input()
        else if e.keyCode == 13
            e.preventDefault()

    button_send_chat: (e) ->
        send_chat(e, @refs.log_container, ReactDOM.findDOMNode(@refs.input).value, @props.actions)

    on_scroll: (e) ->
        @props.actions.set_use_saved_position(true)
        node = ReactDOM.findDOMNode(@refs.log_container)
        @props.actions.save_scroll_state(node.scrollTop, node.scrollHeight, node.offsetHeight)
        e.preventDefault()

    componentDidMount: ->
        scroll_to_position(@refs.log_container, @props.saved_position, @props.offset, @props.height, @props.use_saved_position, @props.actions)

    componentWillReceiveProps: (next) ->
        if (@props.messages != next.messages or @props.input != next.input) and is_at_bottom(@props.saved_position, @props.offset, @props.height)
            @props.actions.set_use_saved_position(false)

    componentDidUpdate: ->
        if not @props.use_saved_position
            scroll_to_bottom(@refs.log_container, @props.actions)

    # All render methods
    render : ->
        if not @props.messages? or not @props.redux?
            return <Loading/>

        side_chat_log_style =
            overflowY    : "auto"
            overflowX    : "hidden"
            height       : "#{@props.max_height}px"
            margin       : "0px"
            padding      : "0"
            background   : "white"

        <div>
            <Well style={side_chat_log_style} ref='log_container' onScroll={@on_scroll} >
                <ChatLog
                    messages     = {@props.messages}
                    account_id   = {@props.account_id}
                    user_map     = {@props.user_map}
                    project_id   = {@props.project_id}
                    font_size    = {@props.font_size}
                    file_path    = {if @props.path? then misc.path_split(@props.path).head}
                    actions      = {@props.actions}
                    focus_end    = {focus_endpoint}
                    show_heads   = {false} />
            </Well>
            <Row>
                <Col xs={2} style={padding:'0px 2px 0px 2px', marginLeft: "15px", width:"60%"}>
                    <form>
                        <FormGroup>
                            <FormControl
                                autoFocus   = {true}
                                rows        = {2}
                                componentClass = 'textarea'
                                ref         = 'input'
                                onKeyDown   = {@on_keydown}
                                value       = {@props.input}
                                placeholder = {'Type a message...'}
                                onClick     = {@mark_as_read}
                                onChange    = {(e)=>@props.actions.set_input(e.target.value)}
                                onFocus     = {focus_endpoint}
                                style       = {@mobile_chat_input_style}
                            />
                        </FormGroup>
                    </form>
                </Col>
                <Col xs={1} style={height:'57px', padding:'0px 2px 0px 2px', width:"31%"}>
                    <Button onClick={@button_send_chat} disabled={@props.input==''} bsStyle='primary' style={height:'90%', width:'100%', marginTop:'5px'}>
                        <Icon name='chevron-circle-right'/>
                    </Button>
                </Col>
            </Row>
        </div>


# Fitting the side chat into non-react parts of SMC:

render = (redux, project_id, path, max_height) ->
    name = redux_name(project_id, path)
    file_use_id = require('smc-util/schema').client_db.sha1(project_id, path)
    C = ChatRoom(name)
    <Redux redux={redux}>
        <C redux={redux} actions={redux.getActions(name)} name={name} project_id={project_id} path={path} file_use_id={file_use_id} max_height={max_height} />
    </Redux>

# Render the given chatroom, and return the name of the redux actions/store
exports.render = (project_id, path, dom_node, redux, max_height) ->
    name = init_redux(path, redux, project_id)
    ReactDOM.render(render(redux, project_id, path, max_height), dom_node)
    return name

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

