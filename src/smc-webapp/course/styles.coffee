misc = require('smc-util/misc')
{types} = misc

exports.entry_style =
    paddingTop    : '5px'
    paddingBottom : '5px'

exports.selected_entry = misc.merge
    border        : '1px solid #aaa'
    boxShadow     : '5px 5px 5px #999'
    borderRadius  : '3px'
    marginBottom  : '10px',
    exports.entry_style

exports.note =
    borderTop  : '3px solid #aaa'
    marginTop  : '10px'
    paddingTop : '5px'

exports.show_hide_deleted = (opts) ->
    types opts,
        needs_margin : types.bool.isRequired

    marginTop  : if opts.needs_margin then '15px' else '0px'
    float      : 'right'

