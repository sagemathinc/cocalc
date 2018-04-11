###
Manage codemirror gutters that highlight latex typesetting issues.
###

{required, defaults} = require('smc-util/misc')

{React}  = require('../smc-react')


exports.update_gutters = (opts) ->
    opts = defaults opts,
        log        : required
        set_gutter : required
    #opts.set_gutter(7, <div>Foo</div>)