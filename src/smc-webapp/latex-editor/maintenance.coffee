async = require('async')

misc = require('smc-util/misc')
{defaults, required} = misc
{webapp_client} = require('../webapp_client')

exports.clean = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        log        : required
        cb         : required

    {head, tail} = misc.path_split(opts.path)
    base_filename = misc.separate_file_extension(tail).name

    EXT = ['aux', 'log', 'bbl', 'fls', 'synctex.gz', 'sagetex.py', 'sagetex.sage', 'sagetex.sage.py', 'sagetex.scmd', 'sagetex.sout']
    EXT = ('.' + E for E in EXT)
    EXT.push('-concordance.tex')
    async.series([
        (cb) ->
            opts.log("Running 'latexmk -f -c #{base_filename}' in '#{head}'...\n")
            # needs to come before deleting the .log file!
            webapp_client.exec
                command    : 'latexmk'
                args       : ['-f', '-c', base_filename]
                project_id : opts.project_id
                path       : head
                cb         : (err, output) ->
                    if output?
                        opts.log(output.stdout + '\n' + output.stderr + '\n')
                    if err
                        opts.log("#{err}" + '\n')
                    cb(err)
        (cb) ->
            # this in particular gets rid of the sagetex files
            files = (base_filename + ext for ext in EXT)
            # -f: don't complain when it doesn't exist
            # --: then it works with filenames starting with a "-"
            opts.log("Removing #{', '.join(files)}...")
            webapp_client.exec
                command : "rm"
                args    : ['-v', '-f', '--'].concat(files)
                project_id : opts.project_id
                path    : head
                cb      : (err, output) ->
                    if output?
                        opts.log(output.stdout + '\n' + output.stderr + '\n')
                    if err
                        opts.log("#{err}" + '\n\n')
                    cb(err)
    ], (err) ->
        opts.log('done.')
        opts.cb(err)
    )
