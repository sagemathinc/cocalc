###
Share server top-level landing page.
###

{rclass, React, ReactDOM, redux, Redux, rtypes} = require('../smc-react')

exports.Landing = rclass
    displayName: "Landing"

    render: ->
        <html>
            <head>
                <title>CoCalc public shared files</title>
            </head>
            <body>
                <h1>CoCalc public shared files</h1>
            </body>
        </html>