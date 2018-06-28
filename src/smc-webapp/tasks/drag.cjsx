###
Drag tasks handle (and other support)
###

{React, rclass, rtypes}  = require('../app-framework')

{Icon, Tip} = require('../r_misc')

{SortableHandle} = require('react-sortable-hoc')

DragHandle = rclass
    render: ->
        <Icon style={cursor:'pointer'} name='reorder' />

SortableDragHandle = SortableHandle(DragHandle)

DisabledDragHandle = rclass
    render : ->
        <Tip title={'Select Custom Order to enable dragging tasks.'} delayShow={700}>
            <DragHandle />
        </Tip>

exports.DragHandle = rclass
    propTypes :
        sortable : rtypes.bool

    render: ->
        if @props.sortable
            color = '#888'
            Handle = SortableDragHandle
        else
            color = '#eee'
            Handle = DisabledDragHandle
        <span style={fontSize:'17pt', color:color, marginLeft:'15px'}>
            <Handle />
        </span>
