###
Convert R Markdown file to hidden Markdown file, then read.
###

async                = require('async')

misc                 = require('smc-util/misc')

{required, defaults} = misc

{aux_file}           = require('../code-editor/util')
{webapp_client}      = require('smc-webapp/webapp_client')

exports.convert = (opts) ->
    opts = defaults opts,
        path       : required
        project_id : required
        time       : undefined
        cb         : required    # cb(err, 'markdown string with R parts processed...')
    x = misc.path_split(opts.path)
    locals =
        infile  : x.tail
        outfile : aux_file(x.tail, 'md')
    args = ['-e', "library(knitr);knit('#{locals.infile}','#{locals.outfile}',quiet=TRUE)"]
    async.series([
        (cb) ->
            webapp_client.exec
                allow_post  : false  # definitely could take a long time to fully run all the R stuff...
                timeout     : 60
                command     : 'Rscript'
                args        : args
                project_id  : opts.project_id
                path        : x.head
                err_on_exit : true
                aggregate   : opts.time
                cb          : (err, output) ->
                    if err and output?.stderr
                        err = output.stderr
                    cb(err)
        (cb) ->
            webapp_client.read_text_file_from_project
                project_id : opts.project_id
                path       : aux_file(opts.path, 'md')
                cb         : (err, mesg) ->
                    locals.content = mesg?.content
                    cb(err)
    ], (err) ->
        opts.cb(err, locals.content)
    )
