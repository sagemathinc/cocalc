#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Task last changed: displays when this task was last changed
###

{React, rclass, rtypes}  = require('../app-framework')

{TimeAgo} = require('../r_misc')

exports.Changed = rclass
    propTypes :
        last_edited : rtypes.number

    shouldComponentUpdate: (next) ->
        return @props.last_edited != next.last_edited

    render: ->
        if @props.last_edited
            <TimeAgo date = {new Date(@props.last_edited)} />
        else
            <span />