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
{React, rclass, rtypes} = require('../../smc-react')
{DateTimePicker, ErrorDisplay, Icon, LabeledRow, Loading, MarkdownInput, Space, Tip, NumberInput} = require('../../r_misc')
{Alert, Button, ButtonToolbar, ButtonGroup, Form, FormControl, FormGroup, ControlLabel, InputGroup, Checkbox, Row, Col, Panel, Breadcrumb} = require('react-bootstrap')

exports.Points = rclass
    displayName: 'CourseEditor-GradingStudentAssignment-Points'

    propTypes:
        total_points   : rtypes.number.isRequired
        all_points     : rtypes.immutable.List.isRequired

    shouldComponentUpdate: (next) ->
        update   = misc.is_different(@props, next, ['total_points'])
        update or= not @props.all_points.equals(next.all_points)
        return update

    percentile_rank_help: ->
        url = 'https://en.wikipedia.org/wiki/Percentile_rank'
        misc_page.open_new_tab(url)

    render: ->
        <Row>
            <Col md={10} style={textAlign: 'center'}>
                <ButtonGroup>
                    <Button disabled={true}>
                        Total points
                    </Button>
                    <Button
                        style    = {fontWeight: 'bold', color:'black', paddingLeft:'20px', paddingRight:'20px'}
                        disabled = {true}
                    >
                        {misc.round2(@props.total_points)}
                    </Button>
                    {
                        if @props.all_points.size >= 5
                            pct = misc.percentRank(
                                @props.all_points.toJS(),
                                @props.total_points,
                                true
                            )
                            <Button
                                style     = {color: COLORS.GRAY}
                                onClick   = {=>@percentile_rank_help()}
                            >
                                {misc.round1(pct)}%
                                <span className='hidden-md'> percentile</span>
                            </Button>
                    }
                </ButtonGroup>
            </Col>
        </Row>