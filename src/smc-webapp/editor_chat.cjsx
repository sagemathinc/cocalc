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
editing   : Object of <account id's> : <"TODO">

"TODO" Will likely contain their last edit in the future

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
"date":"2016-07-23T23:10:04.837Z","editing":{"07b12853-07e5-487f-906a-d7ae04536540":"TODO"}}
---

Chat message types after immutable conversion:
(immutable.Map)
sender_id : String
event     : String
date      : Date Object
history   : immutable.Stack of immutable.Maps
editing   : immutable.Map

###

###
This file is all the parts that are similar between side_chat.cjsx (The side chat rooms of all the files) and smc-chat.cjsx (The sagemathcloud chat room)
###

# standard non-SMC libraries
immutable = require('immutable')
{IS_MOBILE} = require('./feature')
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
{React, ReactDOM, rclass, rtypes, Actions, Store, Redux}  = require('./smc-react')
{Icon, Loading, TimeAgo} = require('./r_misc')
{Button, Col, Grid, Input, ListGroup, ListGroupItem, Panel, Row, ButtonGroup} = require('react-bootstrap')

{User} = require('./users')

exports.redux_name = redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

class ChatActions extends Actions
    _syncdb_change: (changes) =>
        m = messages = @redux.getStore(@name).get('messages')
        for x in changes
            if x.insert
                # Assumes all fields to be provided in x.insert
                # console.log('Received', x.insert)
                # OPTIMIZATION: make into custom conversion to immutable
                message = immutable.fromJS(x.insert)
                message = message.set('history', immutable.Stack(immutable.fromJS(x.insert.history)))
                message = message.set('editing', immutable.Map(x.insert.editing))
                message = message.set('video_chat', immutable.Map(x.insert.video_chat))
                messages = messages.set("#{x.insert.date - 0}", message)
            else if x.remove
                messages = messages.delete(x.remove.date - 0)
        if m != messages
            @setState(messages: messages)

    send_chat: (mesg) =>
        if not @syncdb?
            # TODO: give an error or try again later?
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
            # TODO: give an error or try again later?
            return
        author_id = @redux.getStore('account').get_account_id()

        if is_editing
            # TODO: Save edit changes
            editing = message.get('editing').set(author_id, 'TODO')
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
            # TODO: give an error or try again later?
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

    send_video_chat: (mesg) =>
        if not @syncdb?
            # TODO: give an error or try again later?
            return
        # There has to be a better way to get the project_id
        project_id = @redux.getStore(@name).name.substring(7,43)
        time_stamp = salvus_client.server_time()
        @syncdb.update
            set :
                sender_id : project_id
                event     : "chat"
                history   : [{author_id: project_id, content:mesg, date:time_stamp}]
                video_chat  : {"is_video_chat" : true}
            where :
                date: time_stamp
            is_equal: (a, b) => (a - 0) == (b - 0)

        @syncdb.save()

    set_to_last_input: =>
        @setState(input:@redux.getStore(@name).get('last_sent'))

    set_input: (input) =>
        @setState(input:input)

    saved_message: (saved_mesg) =>
        @setState(saved_mesg:saved_mesg)

    set_is_preview: (is_preview) =>
        @setState(is_preview:is_preview)

    set_is_video_chat: (is_video_chat) =>
        @setState(is_video_chat:is_video_chat)

    set_use_saved_position: (use_saved_position) =>
        @setState(use_saved_position:use_saved_position)

    save_scroll_state: (position, height, offset) =>
        # height == 0 means chat room is not rendered
        if height != 0
            @setState(saved_position:position, height:height, offset:offset)

# boilerplate setting up actions, stores, sync'd file, etc.
syncdbs = {}
exports.init_redux = init_redux = (redux, project_id, filename) ->
    name = redux_name(project_id, filename)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, ChatActions)
    store   = redux.createStore(name, {input:''})

    synchronized_db
        project_id    : project_id
        filename      : filename
        sync_interval : 0
        cb            : (err, syncdb) ->
            if err
                alert_message(type:'error', message:"unable to open #{@filename}")
            else
                store.syncdb = actions.syncdb = syncdb

                if not syncdb.valid_data
                    # This should never happen, but obviously it can -- just open the file and randomly edit with vim!
                    # If there were any corrupted chats, append them as a new chat at the bottom, then delete from syncdb.
                    corrupted = (x.corrupt for x in syncdb.select() when x.corrupt?)
                    actions.send_chat("Corrupted chat: " + corrupted.join('\n\n'))
                    syncdb.delete_with_field(field:'corrupt')

                v = {}
                for x in syncdb.select()
                    if x.corrupt?
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
                    if not x.video_chat
                        x.video_chat = {}
                    v[x.date - 0] = x

                actions.setState(messages : immutable.fromJS(v))
                syncdb.on('change', actions._syncdb_change)

### Message Methods ###

exports.newest_content = newest_content = (message) ->
    message.get('history').peek()?.get('content') ? ''

exports.sender_is_viewer = sender_is_viewer = (account_id, message) ->
    account_id == message.get('sender_id')

exports.get_timeago = get_timeago = (message) ->
    <div className="pull-right small" style={color:'#888'}>
        <TimeAgo date={new Date(message.get('date'))} />
    </div>

exports.show_user_name = show_user_name = (sender_name) ->
    <div className={"small"} style={color:"#888", marginBottom:'1px', marginLeft:'10px'}>
        {sender_name}
    </div>

exports.is_editing = is_editing = (message, account_id) ->
    message.get('editing').has(account_id)

exports.blank_column = blank_column = ->
    <Col key={2} xs={2} sm={2}></Col>

exports.render_markdown = render_markdown = (value, project_id, file_path) ->
    <div style={paddingBottom: '1px', marginBottom: '5px'}>
        <Markdown value={value}
                     project_id={project_id}
                     file_path={file_path} />
    </div>

exports.render_history_title = render_history_title = (color, font_size) ->
    <ListGroupItem style={background:color, fontSize: font_size, borderRadius: '10px 10px 0px 0px', textAlign:'center'}>
        <span style={fontStyle: 'italic', fontWeight: 'bold'}>Message History</span>
    </ListGroupItem>

exports.render_history_footer = render_history_footer = (color, font_size) ->
    <ListGroupItem style={background:color, fontSize: font_size, borderRadius: '0px 0px 10px 10px', marginBottom: '3px'}>
    </ListGroupItem>

exports.render_history = render_history = (color, font_size, history, history_author, history_date, user_map) ->
    for date of history and history_author and history_date
        value = history[date]
        value = misc.smiley
            s: value
            wrap: ['<span class="smc-editor-chat-smiley">', '</span>']
        value = misc_page.sanitize_html(value)
        author = user_map.get(history_author[date]).get('first_name') + ' ' + user_map.get(history_author[date]).get('last_name')
        if history[date].trim() == ''
            text = "Message deleted "
        else
            text = "Last edit "
        <ListGroupItem key={date} style={background:color, fontSize: font_size, paddingBottom:'20px'}>
            <div style={paddingBottom: '1px', marginBottom: '5px', wordWrap:'break-word'}>
                <Markdown value={value}/>
            </div>
            <div className="pull-left small" style={color:'#888'}>
                {text}
                <TimeAgo date={new Date(history_date[date])} />
                {' by ' + author}
            </div>
        </ListGroupItem>

### ChatLog Methods ###

exports.get_user_name = get_user_name = (account_id, user_map) ->
    account = user_map?.get(account_id)
    if account?
        account_name = account.get('first_name') + ' ' + account.get('last_name')
    else
        account_name = "Unknown"

### ChatRoom Methods ###

exports.send_chat = send_chat = (e, log_container, input, actions) ->
    scroll_to_bottom(log_container, actions)
    e.preventDefault()
    mesg = input.getValue()
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