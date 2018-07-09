##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2018, Sagemath Inc.
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

# Global libs
immutable = require('immutable')

# CoCalc libraries
{defaults, required} = misc = require('smc-util/misc')
{webapp_client}      = require('../../webapp_client')
{Avatar}             = require('../../other-users')
{COLORS}             = require('smc-util/theme')
misc_page            = require('smc-webapp/misc_page')

# React libraries
{React, rclass, rtypes} = require('../../app-framework')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput} = require('../../r_misc')
{Alert, Button, ButtonToolbar, ButtonGroup, Form, FormControl, FormGroup, ControlLabel, InputGroup, Checkbox, Row, Col, Panel, Breadcrumb} = require('react-bootstrap')

url = 'https://en.wikipedia.org/wiki/Percentile_rank'

exports.Points = rclass
    displayName: 'CourseEditor-GradingStudentAssignment-Points'

    propTypes:
        total_points   : rtypes.number.isRequired
        all_points     : rtypes.immutable.List.isRequired

    getInitialState: ->
        show_percentile_help : false

    shouldComponentUpdate: (props, state) ->
        update   = misc.is_different(@props, props, ['total_points'])
        update or= not @props.all_points.equals(props.all_points)
        update or= misc.is_different(@state, state, ['show_percentile_help'])
        return update

    render_percentile_help: ->
        return null if not @state.show_percentile_help
        <div>
            <Alert bsStyle={'info'} style={marginTop:'10px'}>
                <h5>Percentile rank</h5>
                <div>
                    This tells you how this student performs in relation to all others.
                    Exact definition: <a target={'_blank'} href={url}>Percentile Rank at Wikipedia</a>.
                </div>
                <div style={textAlign:'right'}>
                    <Button
                        onClick  = {=>@setState(show_percentile_help:false)}
                    >
                        Close
                    </Button>
                </div>
            </Alert>
        </div>

    render_percentile_info: ->
        return null if @props.all_points.size < 5
        pct = misc.percentRank(
            @props.all_points.toJS(),
            @props.total_points,
            true
        )
        <Button
            style     = {color: COLORS.GRAY}
            onClick   = {=>@setState(show_percentile_help:true)}
            disabled  = {@state.show_percentile_help}
        >
            {misc.round1(pct)}%
            <span className='hidden-md'> percentile</span>
        </Button>

    render: ->
        <div>
            <div style={textAlign: 'center'}>
                <ButtonGroup style={whiteSpace:'nowrap'}>
                    <Button disabled={true}>
                        Total points
                    </Button>
                    <Button
                        style    = {fontWeight: 'bold', color:'black', paddingLeft:'20px', paddingRight:'20px'}
                        disabled = {true}
                    >
                        {misc.round2(@props.total_points)}
                    </Button>
                    {@render_percentile_info()}
                </ButtonGroup>
            </div>
            {@render_percentile_help()}
        </div>