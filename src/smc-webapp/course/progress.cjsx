###
Progress indicator for assigning/collecting/etc. a particular assignment or handout.
###

{React, rclass, rtypes} = require('../app-framework')
{Icon, Space} = require('../r_misc')

{COLORS} = require('smc-util/theme')

misc = require('smc-util/misc')

progress_info =
    color        : COLORS.GRAY_D
    marginLeft   : '10px'
    whiteSpace   : 'nowrap'

progress_info_done = misc.copy(progress_info)
progress_info_done.color = COLORS.BS_GREEN_DD

exports.Progress = rclass
    propTypes :
        done     : rtypes.number
        not_done : rtypes.number
        step     : rtypes.string
        skipped  : rtypes.bool    # Show skipped text

    render_checkbox: ->
        if @props.not_done == 0
            <span style={fontSize:'12pt'}>
                <Icon name='check-circle' />
                <Space/>
            </span>

    render_status: ->
        if not @props.skipped
            <React.Fragment>
                ({@props.done} / {@props.not_done + @props.done} {@props.step})
            </React.Fragment>
        else
            <React.Fragment>
                Skipped
            </React.Fragment>

    render: ->
        if not @props.done? or not @props.not_done? or not @props.step?
            return <span/>
        if @props.not_done == 0
            style = progress_info_done
        else
            style = progress_info
        <span style={style}>
            {@render_checkbox()}
            {@render_status()}
        </span>
