
misc = require('misc')

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')
{Icon, Tip, SAGE_LOGO_COLOR, Loading, Space} = require('./r_misc')

{UsersViewing} = require('./other-users')

CHAT_INDICATOR_STYLE =
    fontSize     : '14pt'
    borderRadius : '3px'

CHAT_INDICATOR_TIP = <span>
    Hide or show the chat for this file.
    <hr/>
    Use HTML, Markdown, and LaTeX in your chats,
    and press shift+enter to send them.
    Your collaborators will be notified.
</span>

VIDEO_BUTTON_TIP = <span>
    Hide or show the video chatroom associated to this file.
</span>

exports.VideoChatButton = VideoChatButton = rclass

    click_video_button: (e) ->
        console.log 'click video button'
        e.preventDefault()

    render: ->
        <Tip
            title     = {<span>Toggle Video Chat</span>}
            tip       = {VIDEO_BUTTON_TIP}
            placement = 'left'
            delayShow = 1500
            >
            <span onClick={@click_video_button}>
                <Icon name='video-camera'/>
            </span>
        </Tip>


exports.ChatIndicator = rclass
    reduxProps :
        file_use :
            file_use : rtypes.immutable
        page :
            fullscreen : rtypes.bool

    propTypes :
        project_id   : rtypes.string.isRequired
        path         : rtypes.string.isRequired
        is_chat_open : rtypes.bool

    toggle_chat: ->
        a = redux.getProjectActions(@props.project_id)
        if @props.is_chat_open
            a.close_chat({path:@props.path})
        else
            a.open_chat({path:@props.path})

    is_new_chat: ->
        return redux.getStore('file_use')?.get_file_info(@props.project_id, @props.path)?.is_unseenchat ? false

    render_users: ->
        <UsersViewing
            project_id = {@props.project_id}
            path       = {@props.path}
        />

    render_video_button: ->
        <span style={marginLeft:'5px', marginRight:'5px'}>
            <VideoChatButton />
        </span>

    render_chat_button: ->
        if misc.filename_extension(@props.path) == 'sage-chat'
            # Special case: do not show side chat for chatrooms
            return

        new_chat = @is_new_chat()
        color    = if new_chat then '#c9302c' else '#428bca'
        action   = if @props.is_chat_open then 'Hide' else 'Show'
        title    = <span><Icon name='comment'/><Space/> <Space/> {action} chat</span>
        dir      = if @props.is_chat_open then 'down' else 'left'

        <div style={cursor: 'pointer', color: color, marginLeft:'5px', marginRight:'5px'}>
            <Tip
                title     = {title}
                tip       = {CHAT_INDICATOR_TIP}
                placement = 'left'
                delayShow = 2500
                >
                <span onClick={=>@toggle_chat()}>
                    <Icon name="caret-#{dir}" />
                    <Space />
                    <Icon name='comment' />
                </span>
            </Tip>
            {@render_video_button() if @props.is_chat_open}
        </div>

    render : ->
        style    = misc.copy(CHAT_INDICATOR_STYLE)
        style.display = 'flex'
        if @props.fullscreen
            style.top   = '1px'
            style.right = '23px'
        else
            style.top   = '-30px'
            style.right = '3px'

        <div style={style}>
            {@render_users()}
            {@render_chat_button()}
        </div>


