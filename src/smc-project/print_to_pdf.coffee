###############################################
# Printing an individual file to pdf
###############################################

async     = require('async')
fs        = require('fs')
temp      = require('temp')

misc      = require('smc-util/misc')
misc_node = require('smc-util-node/misc_node')
message   = require('smc-util/message')

{defaults, required} = misc

print_sagews = (opts) ->
    opts = defaults opts,
        path       : required
        outfile    : required
        title      : required
        author     : required
        date       : required
        contents   : required
        subdir     : required    # 'true' or 'false', if true, then workdir is a generated subdirectory which will retain the temporary tex files
        extra_data : undefined   # extra data that is useful for displaying certain things in the worksheet.
        timeout    : 90
        cb         : required

    extra_data_file = undefined
    args = [opts.path,                 \
            '--outfile', opts.outfile, \
            '--title', opts.title,     \
            '--author', opts.author,   \
            '--date', opts.date,       \
            '--subdir', opts.subdir,   \
            '--contents', opts.contents\
           ]

    async.series([
        (cb) ->
            if not opts.extra_data?
                cb(); return
            extra_data_file = temp.path() + '.json'
            args.push('--extra_data_file')
            args.push(extra_data_file)
            # NOTE: extra_data is a string that is *already* in JSON format.
            fs.writeFile(extra_data_file, opts.extra_data, cb)
        (cb) ->
            # run the converter script
            misc_node.execute_code
                command     : "smc-sagews2pdf"
                args        : args
                err_on_exit : true
                bash        : false
                timeout     : opts.timeout
                cb          : cb

        ], (err) =>
            if extra_data_file?
                fs.unlink(extra_data_file)  # no need to wait for completion before calling opts.cb
            opts.cb(err)
        )

exports.print_to_pdf = (socket, mesg) ->
    ext  = misc.filename_extension(mesg.path)
    if ext
        pdf = "#{mesg.path.slice(0,mesg.path.length-ext.length)}pdf"
    else
        pdf = mesg.path + '.pdf'

    async.series([
        (cb) ->
            switch ext
                when 'sagews'
                    print_sagews
                        path       : mesg.path
                        outfile    : pdf
                        title      : mesg.options.title
                        author     : mesg.options.author
                        date       : mesg.options.date
                        contents   : mesg.options.contents
                        subdir     : mesg.options.subdir
                        extra_data : mesg.options.extra_data
                        timeout    : mesg.options.timeout
                        cb         : cb
                else
                    cb("unable to print file of type '#{ext}'")
    ], (err) ->
        if err
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
        else
            socket.write_mesg('json', message.printed_to_pdf(id:mesg.id, path:pdf))
    )
