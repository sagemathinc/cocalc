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
