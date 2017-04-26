###
The slideshow toolbar functionality for cells.
###

{FormControl} = require('react-bootstrap')
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

TYPES = [ \
    {title:'-',         value:''}, \
    {title:'Slide',     value:'slide'}, \
    {title:'Sub-Slide', value:'subslide'}, \
    {title:'Fragment',  value:'fragment'}, \
    {title:'Skip',      value:'skip'}, \
    {title:'Notes',     value:'notes'} ]

exports.Slideshow = rclass
    propTypes :
        actions : rtypes.object.isRequired
        cell    : rtypes.immutable.Map.isRequired

    select: (event) ->
        @props.actions.set_cell_slide(@props.cell.get('id'), event.target.value)

    render_options: ->
        for x in TYPES
            <option key={x.value} value={x.value}>{x.title}</option>

    render: ->
        <FormControl
            componentClass = "select"
            placeholder    = "select"
            onChange       = {@select}
            value          = {@props.cell.get('slide') ? ''}>
            {@render_options()}
        </FormControl>
