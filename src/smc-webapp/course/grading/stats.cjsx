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
{COLORS}             = require('smc-util/theme')
misc_page            = require('smc-webapp/misc_page')

# React libraries
{React, rclass, rtypes} = require('../../app-framework')
{Space, Tip} = require('../../r_misc')
{Row, Col} = require('react-bootstrap')

boxstyle =
    display       : 'flex'
    flexDirection : 'column'
    color         : COLORS.GRAY
    marginTop     : '10px'
    #border        : "1px solid #{COLORS.GRAY_L}"
    #borderRadius  : '5px'

style_outer =
    margin           : '10px 20px'
    borderBottom     : "1px solid #{COLORS.GRAY}"
    display          : 'flex'
    justifyContent   : 'space-between'
    flexDirection    : 'row'
    position         : 'relative'
    transform        : 'translateY(-15px)'

style_number = (name, spaces) ->
    ret =
        display        : 'inline-block'
        textAlign      : 'center'
        whiteSpace     : 'nowrap'
        padding        : '1px 5px'
        background     : 'white'
        border         : "1px solid #{COLORS.GRAY}"
        position       : 'relative'
        borderRadius   : '5px'
        transform      : 'translateY(50%)'
        marginLeft     : "#{100 * spaces[name]}%"
    #if name == 'median'
    #    ret.fontWeight = 'bold'
    return ret


exports.GradingStats = rclass
    displayName : "CourseEditor-GradingStudentAssignment-GradingStats"

    propTypes :
        all_points : rtypes.immutable.List

    shouldComponentUpdate: (next) ->
        return not @props.all_points.equals(next.all_points)

    render: ->
        return <div/> if (not @props.all_points?) or @props.all_points.size < 5
        data = misc.five_number_quantiles(@props.all_points.toJS(), true)
        spread = data.max.value - data.min.value + 1
        spaces = {}
        prev = 0
        for k, v of data
            spaces["#{k}"] = (v.value - data.min.value - prev) / spread / 2
            prev = v.value

        <div style={boxstyle}>
            <div
                style = {textAlign:'center'}
            >
                <a
                    href   = {'https://en.wikipedia.org/wiki/Five-number_summary'}
                    target = {'_blank'}
                    style  = {color: COLORS.GRAY}
                >
                    5-number summary
                </a> of all points per student
            </div>
            <div
                style = {textAlign:'center'}
            >
                <div style={style_outer}>
                {
                    for name, point of data
                        <div
                            key   = {name}
                            style = {style_number(name, spaces)}
                        >
                            <Tip
                                title     = {point.help}
                                placement = {'bottom'}
                            >
                                {misc.round1(point.value)}
                            </Tip>
                        </div>
                }
                </div>
            </div>
        </div>
