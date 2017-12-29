###
Hashtag bar for selecting which tasks are shown by tags
###

{React, rclass, rtypes}  = require('../smc-react')

misc = require('smc-util/misc')

exports.HashtagBar = rclass
    propTypes :
        actions  : rtypes.object.isRequired
        hashtags : rtypes.immutable.Map.isRequired

    render: ->
        tags = misc.keys(@props.hashtags.toJS()).join('|')
        <span>
            Hashtag bar: {tags}
        </span>