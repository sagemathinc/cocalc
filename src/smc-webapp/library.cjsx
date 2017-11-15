###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2017, Sagemath Inc.
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

underscore = _ = require('underscore')
misc = require('smc-util/misc')
misc_page = require('./misc_page')

{React, ReactDOM, Actions, Store, Table, rtypes, rclass, Redux}  = require('./smc-react')
{Col, Row, Button, ButtonGroup, ButtonToolbar, FormControl, FormGroup, Panel, Input,
Well, SplitButton, MenuItem, Alert, ListGroup, ListGroupItem} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading, TimeAgo, Tip, ImmutablePureRenderMixin, Space} = require('./r_misc')
{webapp_client} = require('./webapp_client')

# src: where the library files are
# start: open this file after copying the directory
exports.LIBRARY = LIBRARY =
    first_steps :
        src    : '/ext/library/first-steps/src'
        start  : 'first-steps.tasks'

exports.Library = rclass ({name}) ->
    displayName : 'Library'

    reduxProps :
        "#{name}" :
            current_path        : rtypes.string
            library             : rtypes.object

    propTypes :
        actions : rtypes.object.isRequired

    getInitialState: ->
        lang      : 'python'
        selected  : undefined

    selector: ->
        console.log(@props.library)
        if not @props.library?
            return null
        list_style =
            maxHeight  : '200px'
            overflowX  : 'hidden'
            overflowY  : 'scroll'

        <ListGroup style={list_style}>
        {
            for k in _.sortBy(misc.keys(@props.library), (k) => @props.library[k].name?.toLowerCase() ? k)
                v = @props.library[k]
                do (v, k) =>
                    <ListGroupItem
                        key     = {k}
                        active  = {k == @state.selected}
                        onClick = {=> @setState(selected:k)}
                        style   = {width:'100%'}
                    >
                        {v.name ? k}
                    </ListGroupItem>
        }
        </ListGroup>

    details: ->
        if not @state.selected?
            return null
        <span>selected: {misc.to_json(@props.library[@state.selected])}</span>

    render: ->
        <Row>
            <Col sm=6>
                {@selector()}
            </Col>
            <Col sm=6>
                {@details()}
            </Col>
        </Row>
