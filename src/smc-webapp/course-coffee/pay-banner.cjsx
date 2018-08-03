###
A banner across the top of a course that appears if the instructor is not paying in any way, so they
know they should.
###

{React, rclass, rtypes}  = require('../app-framework')

{Alert} = require('react-bootstrap')
{Icon, Space} = require('../r_misc')

exports.PayBanner = rclass
    propTypes:
        settings     : rtypes.immutable.Map.isRequired
        num_students : rtypes.number
        tab          : rtypes.string
        name         : rtypes.string

    shouldComponentUpdate: (next) ->
        return @props.settings != next.settings or \
               @props.tab      != next.tab or \
               @props.num_students != next.num_students

    paid: ->
        if (@props.num_students ? 0) <= 3 # don't bother at first
            return true
        if @props.settings.get('student_pay')
            return true
        if @props.settings.get('institute_pay')
            return true
        return false

    show_configuration: ->
        @actions(@props.name)?.set_tab('configuration')

    render: ->
        if @paid()
            return <span />

        if (@props.num_students ? 0) >= 20
            # Show a harsh error.
            style =
                background : 'red'
                color      : 'white'
                fontSize   : '16pt'
                fontWeight : 'bold'
            link = {color:'navajowhite'}
        else
            style =
                fontSize : '12pt'
                color    : '#666'
            link = {}

        if @props.tab == 'settings'
            mesg = <span>Please select either the student pay or institute pay option below.</span>
        else
            mesg = <span>Please open the course <a onClick={@show_configuration} style={link}>Configuration tab of this course</a> and select a pay option.</span>

        <Alert bsStyle='warning' style={style}>
            <Icon name='exclamation-triangle' style={float:'right', marginTop: '3px'}/>
            <Icon name='exclamation-triangle' />
            <Space/>
            {mesg}
        </Alert>
