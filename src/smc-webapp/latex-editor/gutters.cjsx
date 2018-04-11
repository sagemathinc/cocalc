###
Manage codemirror gutters that highlight latex typesetting issues.
###

misc    = require('smc-util/misc')

{React} = require('../smc-react')
{Icon, Tip} = require('../r_misc')

{SPEC}  = require('./errors-and-warnings')

{required, defaults} = misc

exports.update_gutters = (opts) ->
    opts = defaults opts,
        path       : required
        log        : required
        set_gutter : required
    path = misc.path_split(opts.path).tail
    for group in ['errors', 'typesetting', 'warnings']
        for item in opts.log[group]
            if misc.path_split(item.file).tail != path
                continue
            if not item.line?
                continue
            opts.set_gutter(item.line - 1, component(item.level, item.message, item.content))

component = (level, message, content) ->
    spec = SPEC[level]
    console.log level, message, content
    if not content?
        content = message
        message = misc.capitalize(level)
    <Tip
        title         = {message ? ''}
        tip           = {content ? ''}
        placemenet    = {'right'}
        icon          = {spec.icon}
        stable        = {true}
        size          = {'large'}
        popover_style = {border:"1px solid #{spec.color}"}
        delayShow     = {0}
    >
        <Icon name={spec.icon} style={color:spec.color, cursor:'pointer'} />
    </Tip>