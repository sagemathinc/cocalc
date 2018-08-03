###
Rendering a Sage worksheet cell

###

{rclass, React, rtypes} = require('../app-framework')

{CellInput} = require('./input')
{CellOutput} = require('./output')

exports.Cell = rclass
    displayName: "SageCell"

    propTypes :
        input  : rtypes.string
        output : rtypes.object
        flags  : rtypes.string

    render_input: ->
        <CellInput input={@props.input} flags={@props.flags} />

    render_output: ->
        if @props.output?
            <CellOutput output={@props.output} flags={@props.flags} />

    render: ->
        <div>
            {@render_input()}
            {@render_output()}
        </div>
