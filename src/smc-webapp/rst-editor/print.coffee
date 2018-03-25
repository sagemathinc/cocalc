###
Print rst content
###

{required, defaults} = require('smc-util/misc')
{aux_file}           = require('../code-editor/util')
{print_html}     = require('../html-editor/print')

exports.print_rst = (opts) ->
        opts = defaults opts,
            project_id : required
            path       : required

        path = aux_file(opts.path, 'html')
        return print_html(src : "#{window.app_base_url}/#{opts.project_id}/raw/#{path}")
