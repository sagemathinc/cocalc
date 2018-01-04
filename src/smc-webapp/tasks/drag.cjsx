###
Drag tasks handle (and other support)
###

{React, rclass, rtypes}  = require('../smc-react')

{Icon} = require('../r_misc')

{SortableHandle} = require('react-sortable-hoc')

DragHandle = rclass
    render: ->
        <Icon style={cursor:'pointer', fontSize:'15pt'} name='reorder' />

exports.DragHandle = SortableHandle(DragHandle)
