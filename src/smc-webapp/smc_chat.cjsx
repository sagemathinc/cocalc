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
{IS_MOBILE, isMobile} = require('./feature')
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
{Button, Col, Grid, FormGroup, FormControl, ListGroup, ListGroupItem, Row, ButtonGroup, Well} = require('react-bootstrap')

{User} = require('./users')

{redux_name, init_redux, remove_redux, newest_content, sender_is_viewer, get_timeago, show_user_name, is_editing, blank_column, render_markdown, render_history_title, render_history_footer, render_history, get_user_name, send_chat, clear_input, is_at_bottom, scroll_to_bottom, scroll_to_position, focus_endpoint} = require('./editor_chat')

Message = rclass
    displayName: "Message"

    propTypes:
        message        : rtypes.object.isRequired  # immutable.js message object
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

    show_history: ->
        #No history for mobile, since right now messages in mobile are too clunky
        if not IS_MOBILE
            <span className="small" style={color:'#888', marginLeft:'10px', cursor:'pointer'} onClick={@enable_history}>
                <Tip title='Message History' tip='Show history of editing of this message.'>
                    <Icon name='history'/>
                </Tip>
            </span>

    hide_history: ->
        #No history for mobile, since right now messages in mobile are too clunky
        if not IS_MOBILE
            <span className="small"
                 style={color:'#888', marginLeft:'10px', cursor:'pointer'}
                 onClick={@disable_history} >
                <Tip title='Message History' tip='Hide history of editing of this message.'>
                    <Icon name='history'/> Hide History
                </Tip>
            </span>

    disable_history: ->
        @setState(show_history:false)
        @props.set_scroll()

    enable_history: ->
        @setState(show_history:true)
        @props.set_scroll()

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
                if IS_MOBILE
                    text = "You are now editing ..."
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
                {<Button onClick={@save_edit} bsStyle='success' style={marginLeft:'10px',marginTop:'-5px'} className='small'>Save</Button> if is_editing(@props.message, @props.account_id)}
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

    save_edit: ->
        mesg = ReactDOM.findDOMNode(@refs.editedMessage).value
        if mesg != newest_content(@props.message)
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

        if sender_is_viewer(@props.account_id, @props.message)
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
        value = newest_content(@props.message)

        if sender_is_viewer(@props.account_id, @props.message)
            color = '#eee'
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

        if not @props.is_prev_sender and sender_is_viewer(@props.account_id, @props.message)
            marginTop = "17px"

        if not @props.is_prev_sender and not @props.is_next_sender and not @state.show_history
            borderRadius = '10px 10px 10px 10px'
        else if not @props.is_prev_sender
            borderRadius = '10px 10px 5px 5px'
        else if not @props.is_next_sender
            borderRadius = '5px 5px 10px 10px'

        message_style =
            background   : color
            wordWrap     : "break-word"
            marginBottom : "3px"
            marginTop    : marginTop
            borderRadius : borderRadius
            fontSize     : font_size

        <Col key={1} xs={10} sm={9}>
            {show_user_name(@props.sender_name) if not @props.is_prev_sender and not sender_is_viewer(@props.account_id, @props.message)}
            <Well style={message_style} bsSize="small" onDoubleClick = {@edit_message}>
                {get_timeago(@props.message)}
                {render_markdown(value, @props.project_id, @props.file_path) if not is_editing(@props.message, @props.account_id)}
                {@render_input()   if is_editing(@props.message, @props.account_id)}
                {@editing_status() if @props.message.get('history').size > 1 or  @props.message.get('editing').size > 0}
                {@show_history()   if not @state.show_history and @props.message.get('history').size > 1}
                {@hide_history()   if @state.show_history and @props.message.get('history').size > 1}
            </Well>
            {render_history_title(color, font_size) if @state.show_history}
            {render_history(color, font_size, @props.history, @props.history_author, @props.history_date, @props.user_map) if @state.show_history}
            {render_history_footer(color, font_size) if @state.show_history}
        </Col>

    # All the render methods

    # TODO: Make this a codemirror input
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
                    onChange  = {(e)=>@setState(edited_message: e.target.value)}
                    onFocus   = {@props.focus_end}
                />
            </FormGroup>
        </div>

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
            height             : rtypes.number
            input              : rtypes.string
            is_preview         : rtypes.bool
            messages           : rtypes.immutable
            offset             : rtypes.number
            saved_mesg         : rtypes.string
            saved_position     : rtypes.number
            use_saved_position : rtypes.bool
            video              : rtypes.immutable
            video_window       : rtypes.bool

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
        input          : ''
        preview        : ''

    chat_input_style:
        margin       : "0"
        padding      : "4px 7px 4px 7px"
        marginTop    : "5px"

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

    componentWillMount: ->
        @set_preview_state = underscore.debounce(@set_preview_state, 500)
        @set_chat_log_state = underscore.debounce(@set_chat_log_state, 10)
        @debounce_bottom = underscore.debounce(@debounce_bottom, 10)

    componentDidMount: ->
        scroll_to_position(@refs.log_container, @props.saved_position, @props.offset, @props.height, @props.use_saved_position, @props.actions)
        if @props.is_preview
            if is_at_bottom(@props.saved_position, @props.offset, @props.height)
                @debounce_bottom()
        else
            @props.actions.set_is_preview(false)

    componentWillReceiveProps: (next) ->
        if (@props.messages != next.messages or @props.input != next.input) and is_at_bottom(@props.saved_position, @props.offset, @props.height)
            @props.actions.set_use_saved_position(false)

    componentDidUpdate: ->
        if not @props.use_saved_position
            scroll_to_bottom(@refs.log_container, @props.actions)

    mark_as_read: ->
        @props.redux.getActions('file_use').mark_file(@props.project_id, @props.path, 'read')

    keydown : (e) ->
        # TODO: Add timeout component to is_typing
        if e.keyCode==13 and e.shiftKey # 13: enter key
            send_chat(e, @refs.log_container, ReactDOM.findDOMNode(@refs.input).value, @props.actions)
        else if e.keyCode==38 and ReactDOM.findDOMNode(@refs.input).value == ''
            # Up arrow on an empty input
            @props.actions.set_to_last_input()

    on_scroll: (e) ->
        @props.actions.set_use_saved_position(true)
        #@_use_saved_position = true
        node = ReactDOM.findDOMNode(@refs.log_container)
        @props.actions.save_scroll_state(node.scrollTop, node.scrollHeight, node.offsetHeight)
        e.preventDefault()

    button_send_chat: (e) ->
        send_chat(e, @refs.log_container, ReactDOM.findDOMNode(@refs.input).value, @props.actions)

    button_scroll_to_bottom: ->
        scroll_to_bottom(@refs.log_container, @props.actions)

    button_off_click: ->
        @props.actions.set_is_preview(false)
        ReactDOM.findDOMNode(@refs.input.refs.input).focus()

    button_on_click: ->
        @props.actions.set_is_preview(true)
        ReactDOM.findDOMNode(@refs.input.refs.input).focus()
        if is_at_bottom(@props.saved_position, @props.offset, @props.height)
            scroll_to_bottom(@refs.log_container, @props.actions)

    set_chat_log_state: ->
        if @refs.log_container?
            node = ReactDOM.findDOMNode(@refs.log_container)
            @props.actions.save_scroll_state(node.scrollTop, node.scrollHeight, node.offsetHeight)

    set_preview_state: ->
        if @refs.log_container?
            @setState(preview:@props.input)
        if @refs.preview
            node = ReactDOM.findDOMNode(@refs.preview)
            @_preview_height = node.offsetHeight - 12 # sets it to 75px starting then scales with height.

    debounce_bottom: ->
        #debounces it so that the preview shows up then calls
        scroll_to_bottom(@refs.log_container, @props.actions)

    open_video_chat: ->
        @props.actions.open_video_chat_window()

    close_video_chat: ->
        @props.actions.close_video_chat_window()

    show_files : ->
        @props.redux?.getProjectActions(@props.project_id).set_focused_page('project-file-listing')

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
            <Tip title='TimeTravel' tip={tip}  placement='left'>
                <Icon name='history'/> TimeTravel
            </Tip>
        </Button>

    render_bottom_button: ->
        tip = <span>
            Scrolls the chat to the bottom
        </span>

        <Button onClick={@button_scroll_to_bottom}>
            <Tip title='Scroll to Bottom' tip={tip}  placement='left'>
                <Icon name='arrow-down'/> Bottom
            </Tip>
        </Button>

    render_video_chat_off_button: ->
        tip = <span>
            Opens up the video chat window
        </span>

        <Button onClick={@open_video_chat}>
            <Tip title='Video Chat' tip={tip}  placement='left'>
                <Icon name='video-camera'/> Video Chat
            </Tip>
        </Button>

    render_video_chat_on_button: ->
        tip = <span>
            Closes up the video chat window
        </span>

        <Button onClick={@close_video_chat}>
            <Tip title='Video Chat Button' tip={tip}  placement='left'>
                <Icon name='video-camera' style={color: "red"}/> Video Chat
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


        mobile_chat_log_style =
            overflowY    : "auto"
            overflowX    : "hidden"
            maxHeight    : "60vh"
            height       : "100%"
            margin       : "0px 0px 0px 13px"
            padding      : "0"

        if not IS_MOBILE
            <Grid>
                <Row style={marginBottom:'5px'}>
                    <Col xs={2} mdHidden>
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
                            {if @props.video_window then @render_video_chat_on_button() else @render_video_chat_off_button()}
                            {@render_bottom_button()}
                        </ButtonGroup>
                    </Col>
                </Row>
                <Row>
                    <Col md={12} style={padding:'0px 2px 0px 2px'}>
                        <Well style={chat_log_style} ref='log_container' onScroll={@on_scroll}>
                            <ChatLog
                                messages     = {@props.messages}
                                account_id   = {@props.account_id}
                                user_map     = {@props.user_map}
                                project_id   = {@props.project_id}
                                font_size    = {@props.font_size}
                                file_path    = {if @props.path? then misc.path_split(@props.path).head}
                                actions      = {@props.actions}
                                saved_mesg   = {@props.saved_mesg}
                                focus_end    = {focus_endpoint}
                                set_scroll   = {@set_chat_log_state}
                                show_heads   = true />
                            {@render_preview_message() if @props.input.length > 0 and @props.is_preview}
                        </Well>
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
                                onChange    = {(e)=>@props.actions.set_input(e.target.value)}
                                onFocus     = {focus_endpoint}
                                style       = {@chat_input_style}
                            />
                        </FormGroup>
                    </Col>
                    <Col xs={2} md={1} style={height:'98.6px', padding:'0px 2px 0px 2px', marginBottom: '12px'}>
                        <Button onClick={@button_on_click} disabled={@props.input==''} bsStyle='info' style={height:'30%', width:'100%', marginTop:'5px'}>Preview</Button>
                        <Button onClick={@button_send_chat} disabled={@props.input==''} bsStyle='success' style={height:'60%', width:'100%'}>Send</Button>
                    </Col>
                </Row>
                <Row>
                    {@render_bottom_tip()}
                </Row>
            </Grid>
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
                        <Well style={mobile_chat_log_style} ref='log_container' onScroll={@on_scroll} >
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
                    </Col>
                </Row>
                <Row>
                    <Col xs={10} style={padding:'0px 2px 0px 2px'}>
                        <FormGroup>
                            <FormControl
                                autoFocus   = {isMobile.Android()}
                                rows        = 2
                                type        = 'textarea'
                                ref         = 'input'
                                onKeyDown   = {@keydown}
                                value       = {@props.input}
                                placeholder = {'Type a message...'}
                                onClick     = {@mark_as_read}
                                onChange    = {(e)=>@props.actions.set_input(e.target.value)}
                                style       = {@mobile_chat_input_style}
                            />
                        </FormGroup>
                    </Col>
                    <Col xs={2} style={height:'57px', padding:'0px 2px 0px 2px'}>
                        <Button onClick={@button_send_chat} disabled={@props.input==''} bsStyle='primary' style={height:'90%', width:'100%', marginTop:'5px'}>
                            <Icon name='chevron-circle-right'/>
                        </Button>
                    </Col>
                </Row>
            </Grid>

ChatEditorGenerator = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    C_ChatRoom = ({path, actions, project_id, redux}) ->
        file_use_id = require('smc-util/schema').client_db.sha1(project_id, path)
        <div style={padding:"7px 7px 7px 7px", borderTop: '1px solid rgb(170, 170, 170)'}>
            <ChatRoom redux={redux} path={path} name={name} actions={actions} project_id={project_id} file_use_id={file_use_id} />
        </div>

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
