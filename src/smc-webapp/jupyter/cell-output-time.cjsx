{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{TimeAgo} = require('../r_misc')

exports.CellTiming = rclass
    propTypes :
        start : rtypes.number
        end   : rtypes.number
        state : rtypes.string

    render: ->
        if not @props.start?
            return <span/>
        if @props.end?
            tip = "#{(@props.end - @props.start)/1000} seconds"
        else if not @props.state? or @props.state == 'done'
            tip = "(killed)"
        <div>
            <TimeAgo date = {new Date(@props.start)} />
            <br/>
            {tip}
        </div>