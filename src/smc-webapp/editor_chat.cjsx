##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
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
date      : Date **string** of when this edit was sent

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
history   : immutable.List of immutable.Maps
editing   : immutable.Map

###

# standard non-CoCalc libraries
immutable = require('immutable')
{IS_MOBILE, isMobile, IS_TOUCH} = require('./feature')
underscore = require('underscore')

# CoCalc libraries
misc = require('smc-util/misc')
misc_page = require('./misc_page')
{defaults, required} = misc
{Markdown, TimeAgo, Tip} = require('./r_misc')
{webapp_client} = require('./webapp_client')

{alert_message} = require('./alerts')

{delay} = require("awaiting")

# React libraries
{React, ReactDOM, rclass, rtypes, Actions, Store, redux}  = require('./app-framework')
{Button, Col, Grid, FormControl, FormGroup, ListGroup, ListGroupItem, Panel, Row, ButtonGroup, Well} = require('react-bootstrap')

{User} = require('./users')

exports.redux_name = redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"


### Message Methods ###
exports.newest_content = newest_content = (message) ->
    return message.get('history').first()?.get('content') ? ''

exports.sender_is_viewer = sender_is_viewer = (account_id, message) ->
    account_id == message.get('sender_id')

exports.message_colors = (account_id, message) ->
    if sender_is_viewer(account_id, message)
        return {background: '#46b1f6', color: '#fff', message_class:'smc-message-from-viewer'}
    else
        return {background: '#efefef', color: '#000', lighten:{color:'#888'}, message_class:'smc-message-from-other'}

exports.render_timeago = (message, edit) ->
    # NOTE: we make click on the timestamp edit the chat since onDoubleClick is completely
    # ignored on mobile touch devices...
    if IS_TOUCH and edit?
        f = edit
    else
        f = undefined
    <span
        onClick   = {f}
        className = "pull-right small"
        style     = {maxWidth:'20%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}
        >
        <TimeAgo date={new Date(message.get('date'))} />
    </span>

NAME_STYLE =
    color        : "#888"
    marginBottom : '1px'
    marginLeft   : '10px'
    right        : 0
    whiteSpace   : 'nowrap'
    overflow     : 'hidden'
    textOverflow : 'ellipsis'    # see https://css-tricks.com/snippets/css/truncate-string-with-ellipsis/
    position     : 'absolute'    # using the "absolute in relative" positioning trick
    left         : 0
    top          : 0

exports.show_user_name = show_user_name = (sender_name) ->
    <div style={position:'relative', height:'1.2em', width:'100%'}>
        <div className={"small"} style={NAME_STYLE}>
            {sender_name}
        </div>
    </div>

exports.is_editing = is_editing = (message, account_id) ->
    message.get('editing').has(account_id)

exports.blank_column = blank_column = ->
    <Col key={2} xs={2} sm={2}></Col>

exports.render_markdown = render_markdown = (value, project_id, file_path, className) ->
    # the marginBottom offsets that markdown wraps everything in a p tag
    <div style={marginBottom:'-10px'}>
        <Markdown value={value} project_id={project_id} file_path={file_path} className={className} checkboxes={true} />
    </div>

exports.render_history_title = render_history_title =  ->
    <ListGroupItem style={borderRadius: '10px 10px 0px 0px', textAlign:'center', padding: '0px'}>
        <span style={fontStyle: 'italic', fontWeight: 'bold'}>Message History</span>
    </ListGroupItem>

exports.render_history_footer = render_history_footer = ->
    <ListGroupItem style={borderRadius: '0px 0px 10px 10px', marginBottom: '3px'}>
    </ListGroupItem>

exports.render_history = render_history = (history, user_map) ->
    if not history?
        return
    historyList = history.toJS().slice(1)  # convert to javascript from immutable, and remove current version.
    for index, objects of historyList
        value = objects.content
        value = misc.smiley
            s: value
            wrap: ['<span class="smc-editor-chat-smiley">', '</span>']
        value = misc_page.sanitize_html_safe(value)
        author = misc.trunc_middle(user_map.get(objects.author_id)?.get('first_name') + ' ' + user_map.get(objects.author_id)?.get('last_name'), 20)
        if value.trim() == ''
            text = "Message deleted "
        else
            text = "Last edit "
        <Well key={index} bsSize="small" style={marginBottom:'0px'}>
            <div style={marginBottom: '-10px', wordWrap:'break-word'}>
                <Markdown value={value} checkboxes={true} />
            </div>
            <div className="small">
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
exports.is_at_bottom = is_at_bottom = (saved_position, offset, height) ->
    # 20 for covering margin of bottom message
    saved_position + offset + 20 > height

exports.scroll_to_bottom = scroll_to_bottom = (log_container_ref) ->
    for d in [1, 250, 500]
        windowed_list = log_container_ref.current
        if windowed_list?
            windowed_list.scrollToRow(-1)
            await delay(d)


