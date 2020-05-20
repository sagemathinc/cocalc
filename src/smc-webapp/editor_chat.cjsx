#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

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

exports.scroll_to_bottom = scroll_to_bottom = (log_container_ref, force) ->
    if (not force and log_container_ref.current?.chat_manual_scroll) or log_container_ref.current?.chat_scroll_to_bottom
        return
    try
        # this "chat_scroll_to_bottom" is an abusive hack because I'm lazy -- ws.
        log_container_ref.current?.chat_scroll_to_bottom = true
        delete log_container_ref.current?.chat_manual_scroll
        for d in [1, 50, 200]
            log_container_ref.current?.chat_scroll_to_bottom = true
            windowed_list = log_container_ref.current
            if windowed_list?
                windowed_list.scrollToRow(-1)
                await delay(d)
    finally
        delete log_container_ref.current?.chat_scroll_to_bottom
