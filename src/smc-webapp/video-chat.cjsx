#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

{debounce}    = require('underscore')
misc          = require('smc-util/misc')
{Button}      = require('react-bootstrap')
{sha1}        = require('smc-util/schema').client_db
{server_time} = require('./webapp_client').webapp_client
{analytics_event} = require('./tracker')

{alert_message} = require('./alerts')

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./app-framework')
{Icon, Tip, SetIntervalMixin} = require('./r_misc')

VIDEO_CHAT_SERVER = 'https://meet.jit.si'
VIDEO_UPDATE_INTERVAL_MS = 30*1000
VIDEO_CHAT_LIMIT         = 99999       # jit.si doesn't seem to have a limit...
# The pop-up window for video chat
video_window = (title, url, cb_closed) ->
    {open_new_tab} = require('smc-webapp/misc_page')
    return open_new_tab(url, popup=true)

    # disabled, see https://github.com/sagemathinc/cocalc/issues/1899
    #w.document.write """
    #<html>
    #    <head>
    #        <title>#{title}</title>
    #    </head>
    #    <body style='margin: 0px'>
    #        <iframe src='#{url}' width='100%' height='100%' frameborder=0>
    #        </iframe>
    #    </body>
    #</html>
    #"""

video_windows = {}

class exports.VideoChat
    constructor: (@project_id, @path, @account_id) ->

    we_are_chatting: =>
        timestamp = @get_users()?[@account_id]
        return timestamp? and server_time() - timestamp <= VIDEO_UPDATE_INTERVAL_MS

    num_users_chatting: =>
        return misc.len(@get_users())

    get_user_names: =>
        users = redux.getStore("users")
        v = []
        for account_id, _ of @get_users()
            name = users.get_name(account_id)?.trim()
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
        if not secret_token
            alert_message(type:'error', message:"You MUST be a project collaborator -- video chat will fail.")
        return sha1(secret_token, @path)

    # Open the video chat window, if it isn't already opened
    open_video_chat_window: ->
        room_id = @chatroom_id()
        if video_windows[room_id]
            return

        chat_window_is_open = =>
            redux.getActions('file_use').mark_file(@project_id, @path, 'video', 0)

        chat_window_is_open()
        @_video_interval_id = setInterval(chat_window_is_open, VIDEO_UPDATE_INTERVAL_MS*.8)

        title = "CoCalc Video Chat: #{misc.trunc_middle(@path, 30)}"
        url   = "#{VIDEO_CHAT_SERVER}/#{room_id}"
        w     = video_window(title, url)
        # https://github.com/sagemathinc/cocalc/issues/3648
        return if not w?
        video_windows[room_id] = w
        # disabled -- see https://github.com/sagemathinc/cocalc/issues/1899
        #w.addEventListener "unload", =>
        #    @close_video_chat_window()
        # workaround for https://github.com/sagemathinc/cocalc/issues/1899
        poll_window = window.setInterval( =>
            if w.closed != false # != is required for compatibility with Opera
                window.clearInterval(poll_window)
                @close_video_chat_window()
        , 1000)

    # User wants to close the video chat window, but not via just clicking the
    # close button on the popup window
    close_video_chat_window: ->
        room_id = @chatroom_id()
        if w = video_windows[room_id]
            redux.getActions('file_use').mark_file(@project_id, @path, 'video', 0, true, 0)
            clearInterval(@_video_interval_id)
            delete video_windows[room_id]
            w?.close()
