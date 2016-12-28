###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX
# and the Terminal.
#
#    Copyright (C) 2016, SageMath, Inc.
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

{debounce} = require('underscore')

misc = require('smc-util/misc')

{React, ReactDOM, rclass, redux, rtypes, Redux, COLOR} = require('./smc-react')
{Icon, Tip, Loading, Space} = require('./r_misc')

{UsersViewing} = require('./other-users')
{VideoChatButton} = require('./video-chat')

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


    componentWillMount: ->
        @toggle_chat = debounce(@toggle_chat, 500, true)

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
        <span style={marginLeft:'5px', marginRight:'5px', color:'#428bca'}>
            <VideoChatButton
                project_id = {@props.project_id}
                path       = {@props.path}
            />
        </span>

    render_chat_button: ->
        if misc.filename_extension(@props.path) == 'sage-chat'
            # Special case: do not show side chat for chatrooms
            return

        new_chat = @is_new_chat()
        color    = if new_chat then COLOR.FG_RED else COLOR.FG_BLUE
        action   = if @props.is_chat_open then 'Hide' else 'Show'
        title    = <span><Icon name='comment'/><Space/> <Space/> {action} chat</span>
        dir      = if @props.is_chat_open then 'down' else 'left'
        clz      = if new_chat then 'smc-chat-notification' else ''

        <div style={cursor: 'pointer', color: color, marginLeft:'5px', marginRight:'5px'} className={clz} >
            {@render_video_button() if @props.is_chat_open}
            <Tip
                title     = {title}
                tip       = {CHAT_INDICATOR_TIP}
                placement = 'left'
                delayShow = 2500
                >
                <span onClick={@toggle_chat}>
                    <Icon name="caret-#{dir}" />
                    <Space />
                    <Icon name='comment' />
                </span>
            </Tip>
        </div>

    render : ->
        style = misc.copy(CHAT_INDICATOR_STYLE)
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


