###
Share server top-level landing page.
###

{rclass, React, ReactDOM, rtypes} = require('../smc-react')

exports.Landing = rclass
    displayName: "Landing"

    propTypes :
        public_paths : rtypes.immutable.Map.isRequired

    render: ->
        <div>
            There are <a href='paths'>{@props.public_paths.size} public paths.</a>
        </div>
