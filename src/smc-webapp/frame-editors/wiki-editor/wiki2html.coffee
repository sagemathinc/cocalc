###
Convert Mediawiki file to hidden HTML file, which gets displayed in an iframe with
src pointed to this file (via raw server).
###

misc                 = require('smc-util/misc')

{required, defaults} = misc

{aux_file}           = require('../code-editor/util')
{webapp_client}      = require('smc-webapp/webapp_client')

exports.convert = (opts) ->
    opts = defaults opts,
        path       : required
        project_id : required
        time       : undefined
        cb         : required
    x = misc.path_split(opts.path)
    outfile = aux_file(opts.path, 'html')
    webapp_client.exec
        command     : 'pandoc'
        args        : ["--toc", '-f', 'mediawiki', '-t', 'html5', '--highlight-style', 'pygments', opts.path, '-o', outfile]
        project_id  : opts.project_id
        err_on_exit : true
        aggregate   : opts.time
        cb          : (err) ->
            if err
                opts.cb(err)
            else
                opts.cb(undefined, outfile)

