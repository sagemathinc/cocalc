
misc = require('misc')

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')
{Icon, Tip, SAGE_LOGO_COLOR, Loading, Space} = require('./r_misc')

{UsersViewing} = require('./profile')

CHAT_INDICATOR_STYLE =
    fontSize     : '14pt'
    position     : 'absolute'
    right        : '3px'
    zIndex       : 1000
    background   : '#fafafa'
    borderRadius : '3px'
    paddingLeft  : '5px'
    paddingRight : '5px'

CHAT_INDICATOR_TIP = <span>
    Hide or show the chat for this file.
    <hr/>
    Use HTML, Markdown, and LaTeX in your chats,
    and press shift+enter to send them.
    Your collaborators will be notified.
</span>

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

    render : () ->
        new_chat = @is_new_chat()
        color    = if new_chat then '#c9302c' else 'black'
        action   = if @props.is_chat_open then 'Hide' else 'Show'
        title    = <span><Icon name='comment'/><Space/> <Space/> {action} chat</span>
        dir      = if @props.is_chat_open then 'down' else 'left'
        style    = misc.copy(CHAT_INDICATOR_STYLE)
        if @props.fullscreen
            style.top   = '1px'
            style.right = '23px'
        else
            style.top   = '-30px'
            style.right = '3px'

        <div style={style}>
            {@render_users()}
            <Tip
                title     = {title}
                tip       = {CHAT_INDICATOR_TIP}
                placement = 'left'
                delayShow = 2500
                >
                <div style={cursor: 'pointer', color: color} onClick={=>@toggle_chat()} >
                    <Icon name="caret-#{dir}" />
                    <Space />
                    <Icon name='comment' />
                </div>
            </Tip>
        </div>


