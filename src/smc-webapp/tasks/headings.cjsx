###
Headings of the task list:

  - Custom order
  - Due
  - Changed
###

{Row, Col} = require('react-bootstrap')

{React, rclass, rtypes}  = require('../app-framework')

{Icon, Space} = require('../r_misc')

exports.HEADINGS     = HEADINGS = ['Custom Order', 'Due', 'Changed']
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

exports.is_sortable = (sort_column) ->
    return sort_column == exports.HEADINGS[0]

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
            sort = <span><Space/><Icon name={"caret-#{if @props.dir == 'asc' then 'down' else 'up'}"} /></span>
        else
            sort = undefined
        <a onClick={@click} style={cursor:'pointer'}>
            {@props.heading}
            {sort}
        </a>


exports.Headings = rclass
    propTypes :
        actions : rtypes.object.isRequired
        sort    : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return @props.sort != next.sort

    render_heading: (heading, dir) ->
        <Heading
            actions = {@props.actions}
            key     = {heading}
            heading = {heading}
            dir     = {dir}
        />

    render_headings: ->
        column = @props.sort?.get('column') ? HEADINGS[0]
        dir    = @props.sort?.get('dir')    ? HEADINGS_DIR[0]
        # NOTE: we use xs below so that the HEADING columns never wordwrap on
        # skinny screens, since they are really important for being
        # able to control the order.  On the other hand, if they wrap,
        # then they use a LOT of vertical space, which is at an extreme
        # premium for task lists...  See
        #   https://github.com/sagemathinc/cocalc/issues/4305
        # We hide the done column though since it overlaps and we can't
        # sort by that.
        <Row style={borderBottom:'1px solid lightgray'}>
            <Col xs={1} style={color:'#666', textAlign:'center'}>

            </Col>
            <Col xs={6} style={color:'#666'}>
                Description
            </Col>
            <Col xs={2}>
                {@render_heading(HEADINGS[0], if column==HEADINGS[0] then dir)}
            </Col>
            <Col xs={1}>
                {@render_heading(HEADINGS[1], if column==HEADINGS[1] then dir)}
            </Col>
            <Col xs={1}>
                {@render_heading(HEADINGS[2], if column==HEADINGS[2] then dir)}
            </Col>
            <Col xs={1} style={color:'#666'}  className={'visible-sm-inline visible-md-inline visible-lg-inline'}>
                Done
            </Col>
        </Row>

    render: ->
        <div style={padding:'0 10px'}>
            {@render_headings()}
        </div>