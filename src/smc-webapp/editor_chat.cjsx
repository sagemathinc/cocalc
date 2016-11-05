##############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
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
{IS_MOBILE, isMobile} = require('./feature')
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
{Button, Col, Grid, FormControl, FormGroup, ListGroup, ListGroupItem, Panel, Row, ButtonGroup, Well} = require('react-bootstrap')

{User} = require('./users')

exports.redux_name = redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

class ChatActions extends Actions
    _init: () =>
        ## window.a = @  # for debugging
        # be explicit about exactly what state is in the store
        @setState
            height             : 0          # 0 means not rendered; otherwise is the height of the chat editor
            input              : ''         # content of the input box
            is_preview         : undefined  # currently displaying preview of the main input chat
            last_sent          : undefined  # last sent message
            messages           : undefined  # immutablejs map of all messages
            offset             : undefined  # information about where on screen the chat editor is located
            position           : undefined  # more info about where chat editor is located
            saved_mesg         : undefined  # I'm not sure yet (has something to do with saving an edited message)
            use_saved_position : undefined  # whether or not to maintain last saved scroll position (used when unmounting then remounting, e.g., due to tab change)
            video              : undefined  # shared state about video chat: {room_id:'...', users:{account_id:timestamp, ...}}
            video_window       : undefined  # true if the video window is opened.
            video_interval     : undefined  # if set, the id of an interval timer that updates video with info about video_window being open

    # Initialize the state of the store from the contents of the syncdb.
    init_from_syncdb: () =>
        v = {}
        video = undefined
        for x in @syncdb.select()
            if x.corrupt?
                continue

            switch x.event

                when 'chat'
                    if x.video_chat?.is_video_chat
                        # discard/ignore anything related to the old video chat approach
                        continue
                    if x.history
                        x.history = immutable.Stack(immutable.fromJS(x.history))
                    else if x.payload? # for old chats with payload: content (2014-2016)
                        initial = immutable.fromJS
                            content   : x.payload.content
                            author_id : x.sender_id
                            date      : x.date
                        x.history = immutable.Stack([initial])
                    else if x.mesg? # for old chats with mesg: content (up to 2014)
                        initial = immutable.fromJS
                            content   : x.mesg.content
                            author_id : x.sender_id
                            date      : x.date
                        x.history = immutable.Stack([initial])
                    if not x.editing
                        x.editing = {}
                    v[x.date - 0] = x

                when 'video'
                    video = immutable.fromJS(x.video)

        @setState
            messages : immutable.fromJS(v)
            video    : video

    _syncdb_change: (changes) =>
        messages_before = messages = @store.get('messages')
        if not messages?
            # Messages need not be defined when changes appear in case of problems or race.
            return
        for x in changes
            if x.insert
                # Assumes all fields to be provided in x.insert
                # console.log('Received', x.insert)
                # OPTIMIZATION: make into custom conversion to immutable
                switch x.insert.event

                    when 'chat'
                        message  = immutable.fromJS(x.insert)
                        message  = message.set('history', immutable.Stack(immutable.fromJS(x.insert.history)))
                        message  = message.set('editing', immutable.Map(x.insert.editing))
                        messages = messages.set("#{x.insert.date - 0}", message)

                    when 'video'
                        # got an update to the shared video state...
                        video = immutable.fromJS(x.insert.video)
                        if not @store.get('video')?.equals(video)
                            # and it is really different
                            @setState(video : video)

            else if x.remove
                if x.remove.event == 'chat'
                    messages = messages.delete(x.remove.date - 0)

        if messages_before != messages
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
        @setState(input:@store.get('last_sent'))

    set_input: (input) =>
        @setState(input:input)

    saved_message: (saved_mesg) =>
        @setState(saved_mesg:saved_mesg)

    set_is_preview: (is_preview) =>
        @setState(is_preview:is_preview)

    set_use_saved_position: (use_saved_position) =>
        @setState(use_saved_position:use_saved_position)

    save_scroll_state: (position, height, offset) =>
        # height == 0 means chat room is not rendered
        if height != 0
            @setState(saved_position:position, height:height, offset:offset)

    save_shared_video_info: (video) =>
        @setState(video: video)
        @syncdb.update
            set :
                video : video   # actual info
            where :
                event : 'video'
        @syncdb.save()  # so other users will know, and so this persists.

    # Open the video chat window, if it isn't already opened
    open_video_chat_window: =>
        if @store.get('video_window')
            # video chat window already opened
            return

        # get shared video chat state
        video = (@store.get('video')?.toJS()) ? {}
        room_id = video.room_id
        if not room_id?
            # the chatroom id hasn't been set yet, so set it
            room_id = misc.uuid()
            video.room_id = room_id
            @save_shared_video_info(video)

        # Create the pop-up window for the chat
        url = "https://appear.in/" + room_id
        w = window.open("", null, "height=640,width=800")
        w.document.write('<html><head><title>Video Chat</title></head><body style="margin: 0px;">')
        w.document.write('<iframe src="'+url+'" width="100%" height="100%" frameborder="0"></iframe>')
        w.document.write('</body></html>')

        w.addEventListener "unload", () =>
            # The user closes the window, so we unset our pointer to the window
            @setState(video_window: undefined, video_window_room_id: undefined)

        @_video_window = w   # slight cheat, since we can't store a window in REDUX (contains only immutable js objects)
        @setState
            video_window         : true
            video_window_room_id : room_id  # use to re-open window in case another user changes the room id

    # user wants to close the video chat window, but not via just clicking the close button on the popup window
    close_video_chat_window: =>
        w = @store.get('video_window')
        if w
            # there is an actual pop-up window, so we close it.
            @_video_window?.close()
            delete @_video_window
            # and record that it is gone.
            @setState(video_window: undefined, video_window_room_id : undefined)

# Set up actions, stores, syncdb, etc.  init_redux returns the name of the redux actions/store associated to this chatroom
syncdbs = {}
exports.init_redux = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    if redux.getActions(name)?
        return name  # already initialized

    actions = redux.createActions(name, ChatActions)
    store   = redux.createStore(name)

    actions._init()

    require('./syncdb').synchronized_db
        project_id    : project_id
        filename      : path
        sync_interval : 0
        cb            : (err, syncdb) ->
            if err
                alert_message(type:'error', message:"unable to open #{@path}")
            else
                actions.syncdb = syncdb
                actions.store = store

                if not syncdb.valid_data
                    # This should never happen, but obviously it can -- just open the file and randomly edit with vim!
                    # If there were any corrupted chats, append them as a new chat at the bottom, then delete from syncdb.
                    corrupted = (x.corrupt for x in syncdb.select() when x.corrupt?)
                    actions.send_chat("Corrupted chat: " + corrupted.join('\n\n'))
                    syncdb.delete_with_field(field:'corrupt')

                actions.init_from_syncdb()
                syncdb.on('change', actions._syncdb_change)
    return name

exports.remove_redux = (path, redux, project_id) ->
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

### Message Methods ###
exports.newest_content = newest_content = (message) ->
    message.get('history').peek()?.get('content') ? ''

exports.sender_is_viewer = sender_is_viewer = (account_id, message) ->
    account_id == message.get('sender_id')

exports.get_timeago = get_timeago = (message) ->
    <span className="pull-right small" style={color:'#888'}>
        <TimeAgo date={new Date(message.get('date'))} />
    </span>

exports.show_user_name = show_user_name = (sender_name) ->
    <div className={"small"} style={color:"#888", marginBottom:'1px', marginLeft:'10px'}>
        {sender_name}
    </div>

exports.is_editing = is_editing = (message, account_id) ->
    message.get('editing').has(account_id)

exports.blank_column = blank_column = ->
    <Col key={2} xs={2} sm={2}></Col>

exports.render_markdown = render_markdown = (value, project_id, file_path) ->
    # the marginBottom offsets that markdown wraps everything in a p tag
    <div style={marginBottom:'-10px'}>
        <Markdown value={value} project_id={project_id} file_path={file_path} />
    </div>

exports.render_history_title = render_history_title = (color, font_size) ->
    <ListGroupItem style={background:color, fontSize: font_size, borderRadius: '10px 10px 0px 0px', textAlign:'center', padding: '0px'}>
        <span style={fontStyle: 'italic', fontWeight: 'bold'}>Message History</span>
    </ListGroupItem>
exports.render_history_footer = render_history_footer = (color, font_size) ->
    <ListGroupItem style={background:color, fontSize: font_size, borderRadius: '0px 0px 10px 10px', marginBottom: '3px'}>
    </ListGroupItem>

exports.render_history = render_history = (color, font_size, history, user_map) ->
    historyList = history?.pop()?.toJS()
    for index, objects of historyList
        value = objects.content
        value = misc.smiley
            s: value
            wrap: ['<span class="smc-editor-chat-smiley">', '</span>']
        value = misc_page.sanitize_html(value)
        author = user_map.get(objects.author_id)?.get('first_name') + ' ' + user_map.get(objects.author_id)?.get('last_name')
        if value.trim() == ''
            text = "Message deleted "
        else
            text = "Last edit "
        <Well key={index} bsSize="small" style={background:color, fontSize: font_size, marginBottom:'0px'}>
            <div style={marginBottom: '-10px', wordWrap:'break-word'}>
                <Markdown value={value}/>
            </div>
            <div className="small" style={color:'#888'}>
                {text}
                <TimeAgo date={new Date(objects.date)} />
                {' by ' + author}
            </div>
        </Well>

### ChatLog Methods ###

exports.get_user_name = get_user_name = (account_id, user_map) ->
    account = user_map?.get(account_id)
    if account?
        account_name = account.get('first_name') + ' ' + account.get('last_name')
    else
        account_name = "Unknown"

### ChatRoom Methods ###
exports.send_chat = send_chat = (e, log_container, mesg, actions) ->
    scroll_to_bottom(log_container, actions)
    e.preventDefault()
    # block sending empty messages
    if mesg.length? and mesg.trim().length >= 1
        actions.send_chat(mesg)
        clear_input(actions)

exports.clear_input = clear_input = (actions) ->
    actions.set_input('')

exports.focus_endpoint = focus_endpoint = (e) ->
    val = e.target.value
    e.target.value = ''
    e.target.value = val

exports.is_at_bottom = is_at_bottom = (saved_position, offset, height) ->
    # 20 for covering margin of bottom message
    saved_position + offset + 20 > height

exports.scroll_to_bottom = scroll_to_bottom = (log_container, actions) ->
    if log_container?
        node = ReactDOM.findDOMNode(log_container)
        node.scrollTop = node.scrollHeight
        actions.save_scroll_state(node.scrollTop, node.scrollHeight, node.offsetHeight)
        actions.set_use_saved_position(false)

exports.scroll_to_position = scroll_to_position = (log_container, saved_position, offset, height, use_saved_position, actions) ->
    if log_container?
        actions.set_use_saved_position(not is_at_bottom(saved_position, offset, height))
        node = ReactDOM.findDOMNode(log_container)
        if use_saved_position
            node.scrollTop = saved_position
        else
            scroll_to_bottom(log_container, actions)

