###
Skip assigning or collecting an assignment, so next step can be attempted.
###

{React, rclass, rtypes} = require('../app-framework')

{Icon, Space, Tip} = require('../r_misc')
{Button} = require('react-bootstrap')

exports.SkipCopy = rclass
    propTypes :
        assignment : rtypes.object.isRequired
        step       : rtypes.string
        actions    : rtypes.object.isRequired

    render_checkbox: ->
        if @props.not_done == 0
            <span style={fontSize:'12pt'}>
                <Icon name='check-circle' />
                <Space/>
            </span>

    click: ->
        @props.actions.set_skip(@props.assignment, @props.step, not @props.assignment.get("skip_#{@props.step}"))

    render: ->
        extra = undefined
        if @props.assignment.get("skip_#{@props.step}")
            icon = 'check-square-o'
            if @props.assignment.get('peer_grade')?.get('enabled')
                # don't bother even trying to implement skip and peer grading at once.
                extra = <span><Space /> (Please disable this or peer grading.)</span>
        else
            icon = 'square-o'
        <Tip placement='left' title="Skip step in workflow" tip="Click this checkbox to enable doing the next step after this step, e.g., you can try to collect assignments that you never explicitly assigned (maybe the students put them in place some other way).">
            <Button onClick={@click}>
                <Icon name={icon} /> Skip {@props.step} {extra}
            </Button>
        </Tip>