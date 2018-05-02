###
Show a minimal status bar at the bottom of the screen when status is set in the store.

Very simple for now.  We should obviously add more later, e.g., number of lines of the file...
###

{React, rclass, rtypes} = require('smc-webapp/smc-react')
{Space} = require('smc-webapp/r_misc')

exports.StatusBar = rclass ({name}) ->
    displayName: 'Editor-StatusBar'

    reduxProps :
        "#{name}" :
            status : rtypes.string

    shouldComponentUpdate: (next) ->
        return @props.status != next.status

    render: ->
        if not @props.status?
            return <span/>
        <div style={border:'1px solid lightgray', color:'#333', padding: '0 5px', fontSize: '10pt'}>
            {@props.status}
            <Space />
        </div>