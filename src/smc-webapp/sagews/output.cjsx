###
Rendering output part of a Sage worksheet cell
###

{rclass, React, rtypes} = require('../smc-react')

misc = require('smc-util/misc')

exports.CellOutput = rclass
    displayName: "SageCell-Output"

    propTypes :
        output : rtypes.object.isRequired
        flags  : rtypes.string

    render_output_mesg: (n) ->
        mesg = @props.output[n]
        <div key={n}>
            {JSON.stringify(mesg)}
        </div>

    render_output: ->
        v = misc.keys(@props.output)
        v.sort (a,b) -> misc.cmp(parseInt(a), parseInt(b))
        for n in v
            @render_output_mesg(n)

    render: ->
        <pre>
            {@render_output()}
        </pre>
