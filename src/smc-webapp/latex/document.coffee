# This manages the latex document itself
# Highlights include the update_pdf (in the end, that's what this is all about) and update_images (for PNG_Preview) methods.

async = require('async')
underscore = _ = require('underscore')
{defaults, required} = misc = require('smc-util/misc')
misc_page = require('../misc_page')
{webapp_client} = require('../webapp_client')

# Class that wraps "a remote latex doc with PDF preview"
class exports.PDFLatexDocument
    constructor: (opts) ->
        opts = defaults opts,
            project_id : required
            filename   : required
            image_type : 'png'  # 'png' or 'jpg'

        @project_id = opts.project_id
        @filename   = opts.filename
        @image_type = opts.image_type
        @ext = misc.filename_extension_notilde(@filename)?.toLowerCase()

        @_pages     = {}
        @num_pages  = 0
        @latex_log  = ''
        s = misc.path_split(@filename)
        @path = s.head
        if @path == ''
            @path = './'
        if @ext == 'rnw'
            @filename_tex = misc.change_filename_extension(s.tail, 'tex')
            @filename_rnw = s.tail
        else
            @filename_tex  = s.tail
        @base_filename = misc.separate_file_extension(@filename_tex).name
        @filename_pdf  = @base_filename + '.pdf'

    dbg: (mesg) =>
        #console.log("PDFLatexDocument: #{mesg}")

    page: (n) =>
        if not @_pages[n]?
            @_pages[n] = {}
        return @_pages[n]

    _exec: (opts) =>
        opts = defaults opts,
            path        : @path
            project_id  : @project_id
            command     : required
            args        : []
            timeout     : 30
            err_on_exit : false
            bash        : false
            cb          : required
        #console.log(opts.path)
        #console.log(opts.command + ' ' + opts.args.join(' '))
        webapp_client.exec(opts)

    spell_check: (opts) =>
        opts = defaults opts,
            lang : undefined
            cb   : required
        if not opts.lang?
            opts.lang = misc_page.language()
        if opts.lang == 'disable'
            opts.cb(undefined,[])
            return
        @_exec
            command : "cat '#{@filename_tex}'|aspell --mode=tex --lang=#{opts.lang} list|sort|uniq"
            bash    : true
            cb      : (err, output) =>
                if err
                    opts.cb(err); return
                if output.stderr
                    opts.cb(output.stderr); return
                opts.cb(undefined, output.stdout.slice(0,output.stdout.length-1).split('\n'))  # have to slice final \n

    inverse_search: (opts) =>
        opts = defaults opts,
            n          : required   # page number
            x          : required   # x coordinate in unscaled png image coords (as reported by click EventEmitter)...
            y          : required   # y coordinate in unscaled png image coords
            resolution : required   # resolution used in ghostscript
            cb         : required   # cb(err, {input:'file.tex', line:?})

        scale = opts.resolution / 72
        x = opts.x / scale
        y = opts.y / scale
        @_exec
            command : 'synctex'
            args    : ['edit', '-o', "#{opts.n}:#{x}:#{y}:#{@filename_pdf}"]
            path    : @path
            timeout : 7
            cb      : (err, output) =>
                if err
                    opts.cb(err); return
                if output.stderr
                    opts.cb(output.stderr); return
                s = output.stdout
                i = s.indexOf('\nInput:')
                input = s.slice(i+7, s.indexOf('\n',i+3))

                # normalize path to be relative to project home
                j = input.indexOf('/./')
                if j != -1
                    fname = input.slice(j+3)
                else
                    j = input.indexOf('/../')
                    if j != -1
                        fname = input.slice(j+1)
                    else
                        fname = input
                if @path != './'
                    input = @path + '/' + fname
                else
                    input = fname

                i = s.indexOf('Line')
                line = parseInt(s.slice(i+5, s.indexOf('\n',i+1)))
                opts.cb(false, {input:input, line:line-1})   # make line 0-based

    forward_search: (opts) =>
        opts = defaults opts,
            n  : required
            cb : required   # cb(err, {page:?, x:?, y:?})    x,y are in terms of 72dpi pdf units

        fn = switch @ext
            when 'tex'
                @filename_tex
            when 'rnw'
                # extensions are considered lowercase, but for synctex it needs to be .Rnw
                misc.change_filename_extension(@filename_rnw, 'Rnw')
            else
                opts.cb("latex forward search: known extension '#{@ext}'")
        @_exec
            command : 'synctex'
            args    : ['view', '-i', "#{opts.n}:0:#{fn}", '-o', @filename_pdf]
            path    : @path
            cb      : (err, output) =>
                if err
                    opts.cb(err); return
                if output.stderr
                    opts.cb(output.stderr); return
                s = output.stdout
                i = s.indexOf('\nPage:')
                n = s.slice(i+6, s.indexOf('\n',i+3))
                i = s.indexOf('\nx:')
                x = parseInt(s.slice(i+3, s.indexOf('\n',i+3)))
                i = s.indexOf('\ny:')
                y = parseInt(s.slice(i+3, s.indexOf('\n',i+3)))
                opts.cb(false, {n:n, x:x, y:y})

    default_tex_command: (flavor) ->
        # errorstopmode recommended by http://tex.stackexchange.com/questions/114805/pdflatex-nonstopmode-with-tikz-stops-compiling
        # since in some cases things will hang (using )
        #return "pdflatex -synctex=1 -interact=errorstopmode '#{@filename_tex}'"
        # However, users hate nostopmode, so we use nonstopmode, which can hang in rare cases with tikz.
        # See https://github.com/sagemathinc/cocalc/issues/156
        latexmk = (f) =>
            # f: force even when there are errors
            # g: ignore heuristics to stop processing latex (sagetex)
            # silent: **don't** set -silent, also silences sagetex mesgs!
            # bibtex: a default, run bibtex when necessary
            # synctex: forward/inverse search in pdf
            # nonstopmode: continue after errors (otherwise, partial files)
            "latexmk -#{f} -f -g -bibtex -synctex=1 -interaction=nonstopmode '#{@filename_tex}'"

        return switch flavor ? 'pdflatex'
            when 'default', 'pdflatex'
                latexmk('pdf')
            when 'xelatex'
                latexmk('xelatex')
            when 'luatex'
                latexmk('lualatex')
            when 'old'
                "pdflatex -synctex=1 -interact=nonstopmode '#{@filename_tex}'"
            else
                latexmk('pdf')

    # runs a latex compiler, updates number of pages, latex log, parsed error log
    update_pdf: (opts={}) =>
        opts = defaults opts,
            status        : undefined  # status(start:'latex' or 'sage' or 'bibtex'), status(end:'latex', 'log':'output of thing running...')
            latex_command : undefined
            cb            : undefined
        @pdf_updated = true
        if not opts.latex_command?
            opts.latex_command = @default_tex_command()
        @_need_to_run =
            knitr  : @ext == 'rnw'
            latex  : true   # initially, only latex is true
            sage   : false  # either false or a filename
            bibtex : false
        log = ''
        status = opts.status

        task_latex = (cb) =>
            if @_need_to_run.latex
                status?(start:'latex')
                @_run_latex opts.latex_command, (err, _log) =>
                    log += _log
                    status?(end:'latex', log:_log)
                    cb(err)
            else
                cb()

        # TODO in the future not necessary, because of 'latexmk -bibtex'
        _task_bibtex = (cb) =>
            status?(start:'bibtex')
            @_run_bibtex (err, _log) =>
                status?(end:'bibtex', log:_log)
                log += _log
                cb(err)

        task_bibtex = (cb) =>
            if @_need_to_run.bibtex
                async.series([_task_bibtex, task_latex], cb)
            else
                cb()

        task_sage = (cb) =>
            if @_need_to_run.sage
                status?(start:'sage')
                @_run_sage @_need_to_run.sage, (err, _log) =>
                    log += _log
                    status?(end:'sage', log:_log)
                    cb(err)
            else
                cb()

        task_knitr = (cb) =>
            if @_need_to_run.knitr
                status?(start:'knitr')
                @_run_knitr (err, _log) =>
                    status?(end:'knitr', log:_log)
                    log += _log
                    cb(err)
            else
                cb()

        # when running knitr, this patches the synctex file
        task_patch_synctex = (cb) =>
            if @_need_to_run.knitr
                status?(start:'synctex')
                @_run_patch_synctex (err, _log) =>
                    status?(end:'synctex', log:_log)
                    log += _log
                    cb(err)
            else
                cb()

        async.series([
            task_knitr,
            task_latex,
            task_sage,
            task_bibtex,
            task_latex,
            task_patch_synctex,
            @update_number_of_pdf_pages
        ], (err) =>
            opts.cb?(err, log)
        )

    _run_latex: (command, cb) =>
        if not command?
            command = @default_tex_command()
        sagetex_file = @base_filename + '.sagetex.sage'
        not_latexmk = command.indexOf('latexmk') == -1
        sha_marker = misc.uuid()
        @_need_to_run ?= {}
        @_need_to_run.latex = false
        # exclusive lock, wait 5 secs to run or fail, exit code on timeout acquiring lock is 99,
        # release read lock to avoid stuck subprocesses to interfere, file descriptor 9 points to lockfile (derived from tex file)
        flock = "flock -x -o -w 5 9 || exit 99;"
        # yes x business recommended by http://tex.stackexchange.com/questions/114805/pdflatex-nonstopmode-with-tikz-stops-compiling
        latex_cmd = "( #{flock} yes x 2> /dev/null | #{command}; echo '#{sha_marker}'; test -r '#{sagetex_file}' && sha1sum '#{sagetex_file}' ) 9> '.#{@filename_tex}.lock'"
        #if DEBUG then console.log("_run_latex cmd:", latex_cmd)
        @_exec
            command     : latex_cmd
            bash        : true
            timeout     : 45
            err_on_exit : false
            cb          : (err, output) =>
                #if DEBUG then console.log("_run_latex done: output=", output, ", err=", err)
                if err
                    cb?(err)
                else if output.exit_code == 99
                    #if DEBUG then console.log("_run_latex: most likely there was a lock-acquiring timeout.")
                    # TODO schedule a retry?
                    log = 'Timeout: ongoing concurrent LaTeX operation.'
                    log += '\n\n' + output.stdout + '\n\n' + output.stderr
                    @last_latex_log = log
                    cb?(false, log)
                else
                    i = output.stdout.lastIndexOf(sha_marker)
                    if i != -1
                        shas = output.stdout.slice(i+sha_marker.length+1)
                        output.stdout = output.stdout.slice(0,i)
                        for x in shas.split('\n')
                            v = x.split(/\s+/)
                            if v.length != 2
                                continue
                            #if DEBUG then console.log(v, sagetex_file, @_sagetex_file_sha)
                            if v[1] == sagetex_file and v[0] != @_sagetex_file_sha
                                @_need_to_run.sage = sagetex_file
                                @_sagetex_file_sha = v[0]

                    log = output.stdout + '\n\n' + output.stderr

                    # TODO remove this in the future. not necessary due to latexmk
                    if not_latexmk and log.indexOf('Rerun to get cross-references right') != -1
                        @_need_to_run.latex = true

                    run_sage_on = '\nRun Sage on'
                    i = log.indexOf(run_sage_on)
                    if i != -1
                        j = log.indexOf(', and then run LaTeX', i)
                        if j != -1
                            # the .replace(/"/g,'') is because sagetex tosses "'s around part of the filename
                            # in some cases, e.g., when it has a space in it.  Tex itself won't accept
                            # filenames with quotes, so this replacement isn't dangerous.  We don't need
                            # or want these quotes, since we're not passing this command via bash/sh.
                            @_need_to_run.sage = log.slice(i + run_sage_on.length, j).trim().replace(/"/g,'')

                    # TODO remove this in the future. not necessary due to latexmk
                    no_bbl = "No file #{@base_filename}.bbl."
                    if not_latexmk and log.indexOf(no_bbl) != -1
                        @_need_to_run.bibtex = true

                    log += "\n\n#{misc.to_json(@_need_to_run)}\n@_sagetex_file_sha: #{@_sagetex_file_sha}"

                    @last_latex_log = log
                    cb?(false, log)

    _run_sage: (target, cb) =>
        @_need_to_run ?= {}
        # don't run sage if target is false
        if underscore.isBoolean(target) and not target
            cb()
        if not target?
            target = @base_filename + '.sagetex.sage'
        @_exec
            command : 'sage'
            args    : [target]
            timeout : 45
            cb      : (err, output) =>
                if err
                    cb?(err)
                else
                    log = output.stdout + '\n\n' + output.stderr
                    @_need_to_run.latex = true
                    cb?(false, log)

    _run_bibtex: (cb) =>
        @_need_to_run ?= {}
        @_exec
            command : 'bibtex'
            args    : [@base_filename]
            timeout : 10
            cb      : (err, output) =>
                if err
                    cb?(err)
                else
                    log = output.stdout + '\n\n' + output.stderr
                    @_need_to_run.latex = true
                    cb?(false, log)

    _run_knitr: (cb) =>
        @_need_to_run ?= {}
        @_exec
            command  : "echo 'require(knitr); opts_knit$set(concordance = TRUE); knit(\"#{@filename_rnw}\")' | R --no-save"
            bash     : true
            timeout  : 60
            cb       : (err, output) =>
                if err
                    cb?(err)
                else
                    log = output.stdout + '\n\n' + output.stderr
                    @_need_to_run.latex = true
                    cb?(false, log)

    _run_patch_synctex: (cb) =>
        # only for knitr, because the full chain is Rnw → tex → pdf
        @_exec
            command  : "echo 'require(patchSynctex);
patchSynctex(\"#{@filename_tex}\");' | R --no-save"
            bash     : true
            timeout  : 10
            cb       : (err, output) =>
                if err
                    cb?(err)
                else
                    log = output.stdout + '\n\n' + output.stderr
                    cb?(false, log)

    pdfinfo: (cb) =>   # cb(err, info)
        @_exec
            command     : "pdfinfo"
            args        : [@filename_pdf]
            bash        : false
            err_on_exit : true
            cb          : (err, output) =>
                if err
                    console.warn("Make sure pdfinfo is installed!  sudo apt-get install poppler-utils.")
                    cb(err)
                    return
                v = {}
                for x in output.stdout?.split('\n')
                    w = x.split(':')
                    if w.length == 2
                        v[w[0].trim()] = w[1].trim()
                cb(undefined, v)

    update_number_of_pdf_pages: (cb) =>
        before = @num_pages
        @pdfinfo (err, info) =>
            # if err maybe no pdf yet -- just don't do anything
            @dbg("update_number_of_pdf_pages: #{err}, #{info?.Pages}")
            if not err and info?.Pages?
                @num_pages = info.Pages
                # Delete trailing removed pages from our local view of things; otherwise, they won't properly
                # re-appear later if they look identical, etc.
                if @num_pages < before
                    for n in [@num_pages ... before]
                        delete @_pages[n]
            cb()

    # runs pdftotext; updates plain text of each page.
    # (not used right now, since we are using synctex instead...)
    update_text: (cb) =>
        @_exec
            command : "pdftotext"   # part of the "calibre" ubuntu package
            args    : [@filename_pdf, '-']
            cb      : (err, output) =>
                if not err
                    @_parse_text(output.stdout)
                cb?(err)

    trash_aux_files: (cb) =>
        log = ''
        EXT = ['aux', 'log', 'bbl', 'fls', 'synctex.gz', 'sagetex.py', 'sagetex.sage', 'sagetex.sage.py', 'sagetex.scmd', 'sagetex.sout']
        EXT = ('.' + E for E in EXT)
        EXT.push('-concordance.tex')
        async.series([
            (cb) =>
                # needs to come before deleting the .log file!
                @_exec
                    command: 'latexmk'
                    args   : ['-c', @base_filename]
                    cb     : (err, output) ->
                        if output?
                            log += output.stdout + '\n\n' + output.stderr + '\n\n'
                        if err
                            log += "#{err}" + '\n\n'
                        cb(err)
            (cb) =>
                # this in particular gets rid of the sagetex files
                files = (@base_filename + ext for ext in EXT)
                # -f: don't complain when it doesn't exist
                # --: then it works with filenames starting with a "-"
                @_exec
                    command : "rm"
                    args    : ['-v', '-f', '--'].concat(files)
                    cb      : (err, output) ->
                        if output?
                            log += output.stdout + '\n\n' + output.stderr + '\n\n'
                        if err
                            log += "#{err}" + '\n\n'
                        cb(err)
        ], (err) =>
            log += 'done.'
            cb?(err, log)
        )

    _parse_text: (text) =>
        # FUTURE -- parse through the text file putting the pages in the correspondings @pages dict.
        # for now... for debugging.
        @_text = text
        n = 1
        for t in text.split('\x0c')  # split on form feed
            @page(n).text = t
            n += 1

    # Updates previews for a given range of pages.
    # This computes images on backend, and fills in the sha1 hashes of @pages.
    # If any sha1 hash changes from what was already there, it gets temporary
    # url for that file.
    # It assumes the pdf files are there already, and doesn't run pdflatex.
    update_images: (opts={}) =>
        opts = defaults opts,
            first_page : 1
            last_page  : undefined  # defaults to @num_pages, unless 0 in which case 99999
            cb         : undefined  # cb(err, [array of page numbers of pages that changed])
            resolution : 50         # number
            device     : '16m'      # one of '16', '16m', '256', '48', 'alpha', 'gray', 'mono'  (ignored if image_type='jpg')
            png_downscale : 2       # ignored if image type is jpg
            jpeg_quality  : 75      # jpg only -- scale of 1 to 100


        res = opts.resolution
        if @image_type == 'png'
            res /= opts.png_downscale

        if not opts.last_page?
            opts.last_page = @num_pages
            if opts.last_page == 0
                opts.last_page = 99999

        #console.log("opts.last_page = ", opts.last_page)

        if opts.first_page <= 0
            opts.first_page = 1
        if opts.last_page > @num_pages
            opts.last_page = @num_pages

        if opts.last_page < opts.first_page
            # easy special case
            opts.cb?(false,[])
            return

        @dbg("update_images: #{opts.first_page} to #{opts.last_page} with res=#{opts.resolution}")

        tmp = undefined
        sha1_changed = []
        changed_pages = []
        pdf = undefined
        async.series([
            (cb) =>
                {tmp_dir} = require('./utils')
                tmp_dir
                    project_id : @project_id
                    path       : "/tmp"
                    ttl        : 60
                    cb         : (err, _tmp) =>
                        tmp = "/tmp/#{_tmp}"
                        cb(err)
            (cb) =>
                pdf = "#{tmp}/#{@filename_pdf}"
                @_exec
                    command : 'cp'
                    args    : [@filename_pdf, pdf]
                    timeout : 15
                    err_on_exit : true
                    cb      : cb
            (cb) =>
                if @image_type == "png"
                    args = ["-r#{opts.resolution}",
                               '-dBATCH', '-dNOPAUSE',
                               "-sDEVICE=png#{opts.device}",
                               "-sOutputFile=#{tmp}/%d.png",
                               "-dFirstPage=#{opts.first_page}",
                               "-dLastPage=#{opts.last_page}",
                               "-dDownScaleFactor=#{opts.png_downscale}",
                               pdf]
                else if @image_type == "jpg"
                    args = ["-r#{opts.resolution}",
                               '-dBATCH', '-dNOPAUSE',
                               '-sDEVICE=jpeg',
                               "-sOutputFile=#{tmp}/%d.jpg",
                               "-dFirstPage=#{opts.first_page}",
                               "-dLastPage=#{opts.last_page}",
                               "-dJPEGQ=#{opts.jpeg_quality}",
                               pdf]
                else
                    cb("unknown image type #{@image_type}")
                    return

                #console.log('gs ' + args.join(" "))
                @_exec
                    command : 'gs'
                    args    : args
                    err_on_exit : true
                    timeout : 120
                    cb      : (err, output) ->
                        cb(err)

            # delete the copied PDF file, we no longer need it (might use up a lot of disk/memory space)
            (cb) =>
                @_exec
                    command : 'rm'
                    args    : [pdf]
                    timeout : 15
                    err_on_exit : true
                    cb      : cb

            # get the new sha1 hashes
            (cb) =>
                @_exec
                    command : "sha1sum *.png *.jpg"
                    bash    : true
                    path    : tmp
                    timeout : 15
                    cb      : (err, output) =>
                        if err
                            cb(err); return
                        for line in output.stdout.split('\n')
                            v = line.split(' ')
                            if v.length > 1
                                try
                                    filename = v[2]
                                    n = parseInt(filename.split('.')[0]) + opts.first_page - 1
                                    if @page(n).sha1 != v[0]
                                        sha1_changed.push( page_number:n, sha1:v[0], filename:filename )
                                catch e
                                    console.log("sha1sum: error parsing line=#{line}")
                        cb()

            # get the images whose sha1's changed
            (cb) =>
                #console.log("sha1_changed = ", sha1_changed)
                update = (obj, cb) =>
                    n = obj.page_number
                    webapp_client.read_file_from_project
                        project_id : @project_id
                        path       : "#{tmp}/#{obj.filename}"
                        timeout    : 10  # a single page shouldn't take long
                        cb         : (err, result) =>
                            if err
                                cb(err)
                            else if not result.url?
                                cb("no url in result for a page")
                            else
                                p = @page(n)
                                p.sha1 = obj.sha1
                                p.url = result.url
                                p.resolution = res
                                changed_pages.push(n)
                                cb()
                async.mapSeries(sha1_changed, update, cb)
        ], (err) =>
            opts.cb?(err, changed_pages)
        )

