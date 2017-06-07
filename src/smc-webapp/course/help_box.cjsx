{React, rclass, rtypes}  = require('../smc-react')
{Panel} = require('react-bootstrap')
{Icon} = require('../r_misc')

exports.HelpBox = rclass
    render: ->
        <Panel header={<h4><Icon name='question-circle' />  Help</h4>}>
            <span style={color:"#666"}>
                <ul>
                    <li>
                        <a href="https://github.com/mikecroucher/SMC_tutorial#sagemathcloud" target="_blank">
                            A tutorial for anyone wanting to use CoCalc for teaching
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
                </ul>
            </span>
        </Panel>