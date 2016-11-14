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

misc = require('misc')

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')
{Icon, Tip, SAGE_LOGO_COLOR, Loading, SetIntervalMixin, Space} = require('./r_misc')
{sha1} = require('smc-util/schema').client_db

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

# The pop-up window for video chat
video_window = (title, url) ->
    w = window.open("", null, "height=640,width=800")
    w.document.write """
<html>
    <head>
        <title>#{title}</title>
    </head>
    <body style='margin: 0px'>
        <iframe src='#{url}' width='100%' height='100%' frameborder=0>
        </iframe>
    </body>
</html>
"""
    return w

video_windows = {}
class VideoChat
    constructor: (@project_id, @path, @account_id) ->

    we_are_chatting: =>
        timestamp = @get_users()?[@account_id]
        return timestamp? and server_time() - timestamp <= VIDEO_UPDATE_INTERVAL_MS

    num_users_chatting: =>
        return misc.len(@get_users())

    get_user_names: =>
        get_name = redux.getStore('users').get_name
        v = []
        for account_id, _ of @get_users()
            name = get_name(account_id)?.trim()
            if name
                name = misc.trunc_middle(name, 25)
                if name
                    v.push(name)
        return v

    get_users: =>
        # Users is a map {account_id:timestamp of last chat file marking}
        return redux.getStore('file_use').get_video_chat_users(project_id: @project_id, path: @path, ttl:1.3*VIDEO_UPDATE_INTERVAL_MS)

    stop_chatting: ->
        @close_video_chat_window()

    start_chatting: ->
        redux.getActions('file_use').mark_file(@project_id, @path, 'chat')
        @open_video_chat_window()

    # The canonical secret chatroom id.
    chatroom_id: ->
        secret_token = redux.getStore('projects').getIn(['project_map', @project_id, 'status', 'secret_token'])
        return sha1(secret_token, @path)

    # Open the video chat window, if it isn't already opened
    open_video_chat_window: =>
        room_id = @chatroom_id()
        if video_windows[room_id]
            return

        chat_window_is_open = =>
            redux.getActions('file_use').mark_file(@project_id, @path, 'video', 0)

        chat_window_is_open()
        @_video_interval_id = setInterval(chat_window_is_open, VIDEO_UPDATE_INTERVAL_MS*.8)

        title = "SageMathCloud Video Chat: #{misc.trunc_middle(@path, 30)}"
        url   = "https://appear.in/#{room_id}"
        w     = video_window(title, url)
        video_windows[room_id] = w
        w.addEventListener "unload", =>
            @close_video_chat_window()

    # User wants to close the video chat window, but not via just clicking the
    # close button on the popup window
    close_video_chat_window: =>
        room_id = @chatroom_id()
        if w = video_windows[room_id]
            redux.getActions('file_use').mark_file(@project_id, @path, 'video', 0, true, 0)
            clearInterval(@_video_interval_id)
            delete video_windows[room_id]
            w?.close()

exports.VideoChatButton = VideoChatButton = rclass
    reduxProps :
        file_use :
            file_use : rtypes.immutable
        account :
            account_id : rtypes.string    # so we can exclude ourselves from list of faces

    propTypes :
        project_id : rtypes.string.isRequired
        path       : rtypes.string.isRequired
        label      : rtypes.string

    mixins: [SetIntervalMixin]

    componentWillMount: ->
        @video_chat = new VideoChat(@props.project_id, @props.path, @props.account_id)
        @setInterval((=> @forceUpdate()), VIDEO_UPDATE_INTERVAL_MS/2)
        @click_video_button = debounce(@click_video_button, 2500, true)

    click_video_button: ->
        if @video_chat.we_are_chatting()    # we are chatting, so stop chatting
            @video_chat.stop_chatting()
        else
            @video_chat.start_chatting()    # not chatting, so start

    render_num_chatting: (num_users_chatting) ->
        if num_users_chatting
            <span>
                <hr />
                There following {num_users_chatting} people are using video chat:
                <br />
                {@video_chat.get_user_names().join(', ')}
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

    render_label: ->
        if @props.label
            <span style={marginLeft:'5px'}>{@props.label}</span>

    render: ->
        num_users_chatting = @video_chat.num_users_chatting()
        if num_users_chatting > 0
            style = {color: '#c9302c'}
        else
            style = {}
        <Tip
            title     = {<span>Toggle Video Chat</span>}
            tip       = {@render_tip(num_users_chatting)}
            placement = 'left'
            delayShow = 1000
            >
            <span onClick={@click_video_button} style={style}>
                <Icon name='video-camera'/>
                {<span style={marginLeft:'5px'}>{num_users_chatting}</span> if num_users_chatting}
                {@render_label()}
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


