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

misc = require('misc')

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')
{Icon, Tip, SAGE_LOGO_COLOR, Loading, SetIntervalMixin, Space} = require('./r_misc')

{UsersViewing} = require('./other-users')

{server_time} = require('./salvus_client').salvus_client

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

VIDEO_UPDATE_INTERVAL_MS = 30*1000

VIDEO_CHAT_LIMIT = 8

class VideoChat
    constructor: (@project_id, @path, @account_id) ->

    we_are_chatting: =>
        timestamp = @get_users()?[@account_id]
        return timestamp? and server_time() - timestamp <= VIDEO_UPDATE_INTERVAL_MS

    num_users_chatting: =>
        return misc.len(@get_users())

    get_users: =>
        # Users is a map {account_id:timestamp of last chat file marking}
        return redux.getStore('file_use').get_video_chat_users(project_id: @project_id, path: @path, ttl:VIDEO_UPDATE_INTERVAL_MS)

    stop_chatting: ->
        redux.getActions('file_use').mark_file(@project_id, @path, 'video', 0, true, 0)

    start_chatting: ->
        redux.getActions('file_use').mark_file(@project_id, @path, 'video', 0)
        redux.getActions('file_use').mark_file(@project_id, @path, 'chat')


exports.VideoChatButton = VideoChatButton = rclass
    reduxProps :
        file_use :
            file_use : rtypes.immutable
        account :
            account_id : rtypes.string    # so we can exclude ourselves from list of faces

    propTypes :
        project_id : rtypes.string.isRequired
        path       : rtypes.string.isRequired

    mixins: [SetIntervalMixin]

    componentDidMount: ->
        @setInterval((=> @forceUpdate()), VIDEO_UPDATE_INTERVAL_MS/2)

    click_video_button: ->
        if @video_chat.we_are_chatting()    # we are chatting, so stop chatting
            @video_chat.stop_chatting()
        else
            @video_chat.start_chatting()    # not chatting, so start

    render_num_chatting: (num_users_chatting) ->
        if num_users_chatting
            <span>
                <hr />
                There are {num_users_chatting} people using video chat.
            </span>

    render_join: (num_users_chatting) ->
        if @video_chat.we_are_chatting()
            <span>Click to <b>leave</b> this video chatroom.</span>
        else
            if num_users_chatting < VIDEO_CHAT_LIMIT
                <span>Click to <b>join</b> this video chatroom.</span>
            else
                <span>At most {VIDEO_CHAT_LIMIT} people can use the video chat at once.</span>

    render_tip: (num_users_chatting) ->
        <span>
            {@render_join(num_users_chatting)}
            {@render_num_chatting(num_users_chatting)}
        </span>

    render: ->
        @video_chat ?= new VideoChat(@props.project_id, @props.path, @props.account_id)
        num_users_chatting = @video_chat.num_users_chatting()
        color = if num_users_chatting > 0 then '#c9302c' else '#428bca'
        <Tip
            title     = {<span>Toggle Video Chat</span>}
            tip       = {@render_tip(num_users_chatting)}
            placement = 'left'
            delayShow = 1500
            >
            <span onClick={@click_video_button} style={color:color}>
                <Icon name='video-camera'/>
                {<span style={marginLeft:'5px'}>{num_users_chatting}</span> if num_users_chatting}
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


