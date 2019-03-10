##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2015 -- 2016, SageMath, Inc.
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

# standard non-CoCalc libraries
immutable = require('immutable')
{IS_MOBILE, IS_TOUCH} = require('./feature')
underscore = require('underscore')

# CoCalc libraries
misc = require('smc-util/misc')
misc_page = require('./misc_page')
{defaults, required} = misc
{webapp_client} = require('./webapp_client')

{alert_message} = require('./alerts')
{analytics_event} = require('./tracker')

# React libraries
{React, ReactDOM, rclass, rtypes, Actions, Store, Redux}  = require('./app-framework')
{Icon, Loading, Markdown, Space, TimeAgo, Tip} = require('./r_misc')
{Button, Col, Grid, FormGroup, FormControl, ListGroup, ListGroupItem, Panel, Row, ButtonGroup, Well} = require('react-bootstrap')

{User} = require('./users')

editor_chat = require('./editor_chat')

{redux_name, init_redux, newest_content, sender_is_viewer, show_user_name, is_editing, blank_column, render_markdown, render_history_title, render_history_footer, render_history, get_user_name, send_chat, clear_input, is_at_bottom, scroll_to_bottom, scroll_to_position} = require('./editor_chat')

{ProjectUsers} = require('./projects/project-users')
{AddCollaborators} = require('./collaborators/add-to-project')

{MentionsInput, Mention} = require('react-mentions')
{ Avatar } = require("./other-users");

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
            @setState(edited_message : newProps.message.get('history')?.first()?.get('content') ? '')
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
                <span className="small" style={marginLeft:'10px', cursor:'pointer'} onClick={=>@toggle_history_side_chat(true)}>
                    <Tip title='Message History' tip='Show history of editing of this message.' placement='left'>
                        <Icon name='history'/> Edited
                    </Tip>
                </span>
            else
                <span className = "small"
                        style   = {marginLeft:'10px', cursor:'pointer'}
                        onClick = {=>@toggle_history_side_chat(false)} >
                    <Tip title='Message History' tip='Hide history of editing of this message.' placement='left'>
                        <Icon name='history'/> Hide History
                    </Tip>
                </span>

    toggle_history_side_chat: (bool) ->
        @setState(show_history:bool)

    editing_status: ->
        other_editors = @props.message.get('editing').remove(@props.account_id).keySeq()
        user = @props.user_map?.get(@props.account_id)
        if not user?  # I hit a traceback in the current_user line below in prod.
            return
        current_user = user.get('first_name') + ' ' + user.get('last_name')
        if is_editing(@props.message, @props.account_id)
            if other_editors.size == 1
                # This user and someone else is also editing
                text = "#{@props.get_user_name(other_editors.first(), @props.user_map)} is also editing this!"
            else if other_editors.size > 1
                # Multiple other editors
                text = "#{other_editors.size} other users are also editing this!"
            else if @state.history_size != @props.message.get('history').size and @state.new_changes
                text = "#{@props.editor_name} has updated this message. Esc to discard your changes and see theirs"
            else
                text = "You are now editing ... Shift+Enter to submit changes."
        else
            if other_editors.size == 1
                # One person is editing
                text = "#{@props.get_user_name(other_editors.first(), @props.user_map)} is editing this message"
            else if other_editors.size > 1
                # Multiple editors
                text = "#{other_editors.size} people are editing this message"
            else if newest_content(@props.message).trim() == ''
                text = "Deleted by #{@props.editor_name}"

        text ?= "Last edit by #{@props.editor_name}"

        if not is_editing(@props.message, @props.account_id) and other_editors.size == 0 and newest_content(@props.message).trim() != ''
            edit = "Last edit "
            name = " by #{@props.editor_name}"
            <span className="small">
                {edit}
                <TimeAgo date={new Date(@props.message.get('history').first()?.get('date'))} />
                {name}
            </span>
        else
            <span className="small">
                {text}
                {<Button onClick={@save_edit} bsStyle='success' style={marginLeft:'10px',marginTop:'-5px'} className='small'>Save</Button> if is_editing(@props.message, @props.account_id)}
            </span>

    edit_message: ->
        @props.actions.set_editing(@props.message, true)

    on_keydown: (e) ->
        if e.keyCode == 27 # ESC
            e.preventDefault()
            @setState
                edited_message : newest_content(@props.message)
            @props.actions.set_editing(@props.message, false)
        else if e.keyCode==13 and e.shiftKey # shift+enter
            @save_edit()

    save_edit: ->
        mesg = ReactDOM.findDOMNode(@refs.editedMessage).value
        if mesg != newest_content(@props.message)
            @props.actions.send_edit(@props.message, mesg)
        else
            @props.actions.set_editing(@props.message, false)

    # All the columns
    content_column: ->
        value = newest_content(@props.message)

        {background, color, lighten, message_class} = editor_chat.message_colors(@props.account_id, @props.message)

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
            background   : background
            wordBreak    : "break-word"
            marginBottom : "3px"
            borderRadius : borderRadius
            color        : color

        if sender_is_viewer(@props.account_id, @props.message)
            message_style.marginLeft = '10%'
        else
            message_style.marginRight = '10%'

        <Col key={1} xs={11} style={width: "100%"}>
            {show_user_name(@props.sender_name) if not @props.is_prev_sender and not sender_is_viewer(@props.account_id, @props.message)}
            <Well style={message_style} bsSize="small" className="smc-chat-message" onDoubleClick = {@edit_message}>
                <span style={lighten}>
                    {editor_chat.render_timeago(@props.message, @edit_message)}
                </span>
                {render_markdown(value, @props.project_id, @props.file_path, message_class) if not is_editing(@props.message, @props.account_id)}
                {@render_input() if is_editing(@props.message, @props.account_id)}
                <span style={lighten}>
                    {@editing_status() if @props.message.get('history').size > 1 or  @props.message.get('editing').size > 0}
                    {@toggle_history() if @props.message.get('history').size > 1}
                </span>
            </Well>
            {render_history_title() if @state.show_history}
            {render_history(@props.history, @props.user_map) if @state.show_history}
            {render_history_footer() if @state.show_history}
        </Col>

    render_input: ->
        <form>
            <FormGroup>
                <FormControl
                    autoFocus      = {true}
                    rows           = {4}
                    componentClass = 'textarea'
                    ref            = 'editedMessage'
                    onKeyDown      = {@on_keydown}
                    value          = {@state.edited_message}
                    onChange       = {(e)=>@setState(edited_message: e.target.value)}
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
            historyContent = @props.messages.get(date).get('history').first()?.get('content') ? ''
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
            last_editor_name = get_user_name(@props.messages.get(date)?.get('history').first()?.get('author_id'), @props.user_map)

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
                     editor_name      = {misc.trunc_middle(last_editor_name,15)}
                     actions          = {@props.actions}
                     saved_mesg       = {@props.saved_mesg}
                     close_input      = {@close_edit_inputs}
                     set_scroll       = {@props.set_scroll}
                    />

        return v

    render: ->
        <Grid fluid style={marginTop: '15px'}>
            {@list_messages()}
        </Grid>

log_container_style =
    overflowY       : 'auto'
    flex            : 1
    backgroundColor : '#fafafa'

ChatRoom = rclass ({name}) ->
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
            add_collab         : rtypes.bool
        users :
            user_map : rtypes.immutable
        account :
            account_id : rtypes.string
            font_size  : rtypes.number
        file_use :
            file_use : rtypes.immutable
        projects :
            project_map : rtypes.immutable.Map

    propTypes:
        redux       : rtypes.object.isRequired
        actions     : rtypes.object.isRequired
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        file_use_id : rtypes.string.isRequired
        path        : rtypes.string

    mark_as_read: ->
        info = @props.redux.getStore('file_use').get_file_info(@props.project_id, misc.original_path(@props.path))
        if not info? or info.is_unseenchat  # only mark chat as read if it is unseen
            f = @props.redux.getActions('file_use').mark_file
            f(@props.project_id, @props.path, 'read')
            f(@props.project_id, @props.path, 'chatseen')

    on_keydown: (e) ->
        if e.keyCode == 27  # ESC
            @props.actions.set_input('')
        else if e.keyCode == 13 and e.shiftKey # shift + enter
            @button_send_chat(e)
            analytics_event('side_chat', 'send_chat', 'keyboard')
        else if e.keyCode == 38 and @props.input == ''  # up arrow and empty
            @props.actions.set_to_last_input()

    on_send_click: (e) ->
        @button_send_chat(e)
        analytics_event('side_chat', 'send_chat', 'click')

    button_send_chat: (e) ->
        send_chat(e, @refs.log_container, @props.input, @props.actions)

    on_scroll: (e) ->
        @props.actions.set_use_saved_position(true)
        node = ReactDOM.findDOMNode(@refs.log_container)
        @props.actions.save_scroll_state(node.scrollTop, node.scrollHeight, node.offsetHeight)
        e.preventDefault()

    componentDidMount: ->
        scroll_to_position(@refs.log_container, @props.saved_position,
                           @props.offset, @props.height, @props.use_saved_position, @props.actions)
        @mark_as_read() # The act of opening/displaying the chat marks it as seen...
                        # since this happens when the user shows it.

    componentWillReceiveProps: (next) ->
        if (@props.messages != next.messages or @props.input != next.input) and is_at_bottom(@props.saved_position, @props.offset, @props.height)
            @props.actions.set_use_saved_position(false)

    componentDidUpdate: ->
        if not @props.use_saved_position
            scroll_to_bottom(@refs.log_container, @props.actions)

    render_collab_caret: ->
        if @props.add_collab
            icon = <Icon name='caret-down'/>
        else
            icon = <Icon name='caret-right'/>
        <div
            style   = {width:'16px', display:'inline-block', cursor:'pointer'}
        >
            {icon}
        </div>

    render_add_collab: ->
        if not @props.add_collab
            return
        project = @props.project_map?.get(@props.project_id)
        if not project?
            return
        <div>
            <div style={margin:'10px 0px'}>
                Who else would you like to work with?
            </div>
            <AddCollaborators
                project = {project}
                inline  = {true}
            />
            <span style={color:'#666'}>
                NOTE: Anybody you add can work with you on any file in this project. Remove people in settings.
            </span>
        </div>

    render_collab_list: ->
        project = @props.project_map?.get(@props.project_id)
        if not project?
            return
        style = undefined
        if not @props.add_collab
            style =
                maxHeight    : '1.7em'
                whiteSpace   : 'nowrap'
                overflow     : 'hidden'
                textOverflow : 'ellipsis'
        <div style   = {style}
             onClick = {=>@props.actions.setState(add_collab:not @props.add_collab)}>
            {@render_collab_caret()}
            <span style={color:'#777', fontSize:'10pt'}>
                <ProjectUsers project={project} none={<span>Add people to work with...</span>}/>
            </span>
        </div>

    render_project_users: ->
        <div style={margin:'5px 15px', maxHeight: '20%', overflow: 'auto', borderBottom: '1px solid lightgrey'}>
            {@render_collab_list()}
            {@render_add_collab()}
        </div>

    render_user_suggestion: (entry) ->
        <span>
            <Avatar size={this.props.font_size + 12} account_id={entry.id} />
            <Space />
            <Space />
            {entry.display}
        </span>

    on_focus: ->
        # Remove any active key handler that is next to this side chat.
        # E.g, this is critical for taks lists...
        @props.redux.getActions('page').erase_active_key_handler()

    on_mention: (id, display) ->
        webapp_client.mention({project_id:@props.project_id, path:misc.original_path(@props.path), target:id, priority:2})

    render: ->
        if not @props.messages? or not @props.redux?
            return <Loading/>

        has_collaborators = false

        user_store = @props.redux.getStore("users")
        # the immutable.Map() default is because of admins:
        # https://github.com/sagemathinc/cocalc/issues/3669
        user_array = @props.project_map
            .getIn([@props.project_id, "users"], immutable.Map())
            .keySeq()
            .filter((account_id) =>
                return account_id != @props.account_id;
            )
            .map((account_id) =>
                has_collaborators = true
                return {
                    id: account_id,
                    display: user_store.get_name(account_id),
                    last_active: user_store.get_last_active(account_id)
                };
            )
            .toJS();
        user_array.sort((x, y) => -misc.cmp_Date(x.last_active, y.last_active));

        mark_as_read = underscore.throttle(@mark_as_read, 3000)

        input_style =
            width: "85%"

            "&multiLine":
                control:
                    backgroundColor: 'white'
                    height:'100%'
                    leftMargin:'2px'
                    fontSize: @props.font_size

                highlighter:
                    padding: 5

                input:
                    border: "1px solid #ccc"
                    borderRadius: "4px"
                    boxShadow: "inset 0 1px 1px rgba(0,0,0,.075)",
                    overflow: "auto",
                    padding: "5px 10px"

            suggestions:
                list:
                    backgroundColor: "white"
                    border: "1px solid #ccc"
                    borderRadius: "4px"
                    fontSize: @props.font_size
                    position: "absolute"
                    bottom: "10px"
                    overflow: "auto"
                    maxHeight: "145px"
                    width: "max-content"
                    display: "flex"
                    flexDirection: "column"

                item:
                    padding: "5px 15px"
                    borderBottom: "1px solid rgba(0,0,0,0.15)"

                    "&focused":
                        backgroundColor: "rgb(66, 139, 202, 0.4)"

        # WARNING: making autofocus true would interfere with chat and terminals -- where chat and terminal are both focused at same time sometimes (esp on firefox).

        <div style       = {height:'100%', width:'100%', position:'absolute', display:'flex', flexDirection:'column', backgroundColor:'#efefef'}
             onMouseMove = {mark_as_read}
             onFocus     = {@on_focus}
             >
            {@render_project_users()}
            <div style   = {log_container_style}
                 ref     = 'log_container'
                 onScroll= {@on_scroll}>
                <ChatLog
                    messages     = {@props.messages}
                    account_id   = {@props.account_id}
                    user_map     = {@props.user_map}
                    project_id   = {@props.project_id}
                    font_size    = {@props.font_size}
                    file_path    = {if @props.path? then misc.path_split(@props.path).head}
                    actions      = {@props.actions}
                    show_heads   = {false} />
            </div>
            <div style={marginTop:'auto', padding:'5px', paddingLeft:'15px', paddingRight:'15px'}>
                <div style={display:'flex', height:'6em'}>
                    <MentionsInput
                        displayTransform = {(id, display, type) => "@" + display}
                        style          = {input_style}
                        markup         = '<span class="user-mention">@__display__</span>'
                        autoFocus      = {false}
                        onKeyDown      = {(e) => mark_as_read(); @on_keydown(e)}
                        value          = {@props.input}
                        placeholder    = {if has_collaborators then "Type a message, @name..." else "Type a message..."}
                        onChange       = {(e) => @props.actions.set_input(e.target.value)}
                    >
                        <Mention
                            trigger="@"
                            data={user_array}
                            onAdd={@on_mention}
                            appendSpaceOnAdd={true}
                            renderSuggestion={@render_user_suggestion}
                        />
                    </MentionsInput>
                    <Button
                        style    = {width:'15%', height:'100%'}
                        onClick  = {@on_send_click}
                        disabled = {@props.input==''}
                        bsStyle  = 'success' >
                        <Icon name='chevron-circle-right'/>
                    </Button>
                </div>
                <div style={color:"#888", padding:'5px'}>
                    Shift+enter to send. Double click to edit. Use <a href='https://help.github.com/articles/getting-started-with-writing-and-formatting-on-github/' target='_blank' rel='noopener'>Markdown</a> and <a href="https://en.wikibooks.org/wiki/LaTeX/Mathematics" target='_blank' rel='noopener'>LaTeX</a>.
                </div>
            </div>
        </div>


# Component for use via React
exports.SideChat = ({path, redux, project_id}) ->
    name        = redux_name(project_id, path)
    file_use_id = require('smc-util/schema').client_db.sha1(project_id, path)
    actions     = redux.getActions(name)
    <ChatRoom
        redux       = {redux}
        actions     = {redux.getActions(name)}
        name        = {name}
        project_id  = {project_id}
        path        = {path}
        file_use_id = {file_use_id}
        />

# Fitting the side chat into non-react parts of SMC:

render = (redux, project_id, path) ->
    name = redux_name(project_id, path)
    file_use_id = require('smc-util/schema').client_db.sha1(project_id, path)
    actions = redux.getActions(name)
    <ChatRoom redux={redux} actions={actions} name={name} project_id={project_id} path={path} file_use_id={file_use_id} />

# Render the given chatroom, and return the name of the redux actions/store
exports.render = (project_id, path, dom_node, redux) ->
    name = init_redux(path, redux, project_id)
    ReactDOM.render(render(redux, project_id, path), dom_node)
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


