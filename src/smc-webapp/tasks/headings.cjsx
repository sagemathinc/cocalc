###
Headings of the task list:

  - Custom order
  - Due
  - Changed
###

{React, rclass, rtypes}  = require('../smc-react')

exports.HEADINGS     = HEADINGS = ['Custom Order',            'Due',            'Changed']
exports.HEADINGS_DIR = HEADINGS_DIR = ['asc', 'desc']
exports.SORT_INFO =
    'Custom Order' :
        key     : 'position'
        reverse : false
    'Due' :
        key     : 'due_date'
        reverse : false
    'Changed' :
        key     : 'last_edited'
        reverse : true


Heading = rclass
    propTypes :
        actions : rtypes.object.isRequired
        heading : rtypes.string.isRequired
        dir     : rtypes.string   # undefined or 'asc' or 'desc'

    shouldComponentUpdate: (next) ->
        return @props.heading != next.heading or @props.dir != next.dir

    click: ->
        switch @props.dir
            when 'asc'  # since @props.dir is defined, heading is currently selected
                dir = 'desc'
            when 'desc' # heading currently selected
                dir = 'asc'
            else        # this heading is not selected, so make it selected and asc
                dir = 'asc'
        @props.actions.set_sort_column(@props.heading, dir)

    render: ->
        if @props.dir?
            sort = <span> {@props.dir}</span>
        else
            sort = undefined
        <span
            style   = {marginRight: '20px', cursor:'pointer'}
            onClick = {@click}>
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
        dir    = @props.sort?.get('dir')    ? HEADINGS_DIR[0]
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