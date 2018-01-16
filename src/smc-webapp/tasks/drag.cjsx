###
Drag tasks handle (and other support)
###

{React, rclass, rtypes}  = require('../smc-react')

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
            color = '#ddd'
            Handle = DisabledDragHandle
        <div style={fontSize:'17pt', color:color, width:'40px'}>
            <Handle />
        </div>
