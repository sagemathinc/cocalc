##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016 -- 2017, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
##############################################################################

{React, rclass, rtypes}  = require('../smc-react')
{Panel} = require('react-bootstrap')
{Icon} = require('../r_misc')
{SITE_NAME, LIVE_DEMO_REQUEST} = require('smc-util/theme')

exports.HelpBox = rclass
    render: ->
        <Panel header={<h4><Icon name='question-circle' />  Help</h4>}>
            <span style={color:"#666"}>
                <ul>
                    <li>
                        <a href="https://tutorial.cocalc.com/" target="_blank">
                            A tutorial for anyone wanting to use CoCalc for teaching <Icon name='external-link'/>
                        </a> (by Mike Croucher)
                    </li>
                    <li>
                        <a href="http://www.beezers.org/blog/bb/2015/09/grading-in-sagemathcloud/" target='_blank'>
                            Grading Courses <Icon name='external-link'/></a> (by Rob Beezer)
                    </li>
                    <li>
                        <a href="http://www.beezers.org/blog/bb/2016/01/pennies-a-day-for-sagemathcloud/" target="_blank">
                            Course Plans and teaching experiences <Icon name='external-link'/></a> (by Rob Beezer)
                    </li>
                    <li>
                        <a href="http://blog.ouseful.info/2015/11/24/course-management-and-collaborative-jupyter-notebooks-via-sagemathcloud/" target='_blank'>
                            Course Management and collaborative Jupyter Notebooks <Icon name='external-link'/></a> (by Tony Hirst)
                    </li>
                    <li>
                        <a href={LIVE_DEMO_REQUEST} target={'_blank'}>Request a Live Demo <Icon name='external-link'/></a> (with a {SITE_NAME} specialist)
                    </li>
                </ul>
            </span>
        </Panel>