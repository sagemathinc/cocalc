###
Backend spell checking support
###

misc                 = require('smc-util/misc')
misc_page            = require('smc-webapp/misc_page')
{defaults, required} = misc
{webapp_client}      = require('smc-webapp/webapp_client')

exports.misspelled_words = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        lang       : undefined
        time       : undefined
        cb         : required
    opts.lang ?= misc_page.language()
    if opts.lang == 'disable'
        opts.cb(undefined,[])
        return
    switch misc.filename_extension(opts.path)
        when 'html'
            mode = 'html'
        when 'tex'
            mode = 'tex'
        else
            mode = 'none'
    command = "cat '#{opts.path}'|aspell --mode=#{mode} --lang=#{opts.lang} list|sort|uniq"
    webapp_client.exec
        project_id  : opts.project_id
        command     : command
        bash        : true
        err_on_exit : true
        allow_post  : true
        aggregate   : opts.time
        cb          : (err, output) ->
            if err
                opts.cb(err)
                return
            if output.stderr
                opts.cb(output.stderr)
                return
            words = output.stdout.slice(0,output.stdout.length-1).split('\n')  # have to slice final \n
            opts.cb(undefined, words)

