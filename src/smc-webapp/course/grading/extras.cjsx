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


exports.GradingHelpButton = rclass
    displayName: 'CourseEditor-GradingStudentAssignment-HelpButton'

    propTypes:
        show_help : rtypes.bool

    getDefaultProps: ->
        show_help : false

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['show_help'])

    open_grading_help: ->
        misc_page.open_new_tab('https://github.com/sagemathinc/cocalc/wiki/CourseGrading')

    render : ->
        <Button
            onClick  = {@open_grading_help}
            bsStyle  = {'default'}
        >
            <Icon name='question-circle'/>
            {' Help' if @props.show_help}
        </Button>

exports.ChatMessageCount = rclass ({chat_name}) ->
    displayName : 'CourseEditor-GradingStudentAssignment-MessageCount'

    reduxProps:
        "#{chat_name}":
            messages        : rtypes.immutable

    propTypes:
        highlight : rtypes.bool

    getDefaultProps: ->
        highlight : false

    shouldComponentUpdate: (next) ->
        update   = misc.is_different(@props, next, ['highlight'])
        update or= (@props.messages?.size ? 0) isnt (next.messages?.size ? 0)
        return update

    render: ->
        N     = @props.messages?.size ? 0
        return null if N == 0
        style = {}
        if N > 0 and @props.highlight
            #style.color      = COLORS.BS_RED
            style.fontWeight = 'bold'

        <span style={style}>{N} {misc.plural(N, 'msg')}.</span>
