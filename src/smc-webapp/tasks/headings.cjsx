###
Headings of the task list:

  - Custom order
  - Due
  - Changed
###

{React, rclass, rtypes}  = require('../smc-react')

exports.HEADINGS = HEADINGS = ['Custom Order', 'Due', 'Changed']
exports.HEADING_DIRS = HEADING_DIRS = ['asc', 'desc']

Heading = rclass
    propTypes :
        actions : rtypes.object.isRequired
        heading : rtypes.string.isRequired
        dir     : rtypes.string   # undefined or asc or desc

    shouldComponentUpdate: (next) ->
        return @props.heading != next.heading or @props.dir != next.dir

    render: ->
        if @props.dir?
            sort = <span> {@props.dir}</span>
        else
            sort = undefined
        <span style={marginRight:'20px'}>
            {@props.heading}
            {sort}
        </span>


exports.Headings = rclass
    propTypes :
        actions : rtypes.object.isRequired
        sort    : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return @props.sort != next.sort

    render_heading: (heading, is_sort_heading, dir) ->
        if is_sort_heading
            sort = <span>{dir}</span>
        else
            sort = undefined

    render_headings: ->
        column = @props.sort?.get('column') ? HEADINGS[0]
        dir    = @props.sort?.get('dir')    ? HEADING_DIRS[0]
        for heading in HEADINGS
            <Heading
                actions = {@props.actions}
                key     = {heading}
                heading = {heading}
                dir     = {if column == heading then dir}
            />

    render: ->
        <div style={border:'1px solid lightgrey'}>
            {@render_headings()}
        </div>