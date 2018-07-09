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
misc = require('smc-util/misc')
{defaults, required} = misc
{COLORS} = require('smc-util/theme')

# React libraries
{React, rclass, rtypes} = require('../app-framework')
{Row, Col} = require('react-bootstrap')
{MarkdownInput, Space, Tip} = require('../r_misc')

# Course libs
styles = require('./styles')

exports.AssignmentNote = rclass
    displayName : "CourseEditorAssignments-Note"

    propTypes:
        name         : rtypes.string.isRequired
        redux        : rtypes.object.isRequired
        assignment   : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (props, state) ->
        return misc.is_different(@props, props, ['assignment'])

    render: ->
        <Row key='note' style={styles.note}>
            <Col xs={2}>
                <Tip title="Notes about this assignment" tip="Record notes about this assignment here. These notes are only visible to you, not to your students.  Put any instructions to students about assignments in a file in the directory that contains the assignment.">
                    Private Assignment Notes<br /><span style={color:COLORS.GRAY}></span>
                </Tip>
            </Col>
            <Col xs={10}>
                <MarkdownInput
                    persist_id    = {@props.assignment.get('path') + @props.assignment.get('assignment_id') + "note"}
                    attach_to     = {@props.name}
                    rows          = {6}
                    placeholder   = 'Private notes about this assignment (not visible to students)'
                    default_value = {@props.assignment.get('note')}
                    on_save       = {(value)=>@props.redux.getActions(@props.name).set_assignment_note(@props.assignment, value)}
                />
            </Col>
        </Row>