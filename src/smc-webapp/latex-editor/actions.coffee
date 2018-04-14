###
LaTeX Editor Actions
###

WIKI_HELP_URL   = 'https://github.com/sagemathinc/cocalc/wiki/LaTeX-Editor'

immutable       = require('immutable')

{Actions}       = require('../code-editor/actions')
tex2pdf         = require('./tex2pdf')
sagetex         = require('./sagetex')
bibtex          = require('./bibtex')
{webapp_client} = require('../webapp_client')
clean           = require('./clean')

{LatexParser}   = require('./latex-log-parser')
{update_gutters} = require('./gutters')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        if not @is_public  # one extra thing after markdown.
            @_init_syncstring_value()
            @_init_tex2pdf()
            @_init_spellcheck()

    _init_tex2pdf: =>
        @_syncstring.on 'save-to-disk', (time) =>
            @_last_save_time = time
            @run_tex2pdf(time)
        @run_tex2pdf()

    _raw_default_frame_tree: =>
        if @is_public
            type : 'cm'
        else
            direction : 'col'
            type      : 'node'
            first     :
                type : 'cm'
            second    :
                direction : 'row'
                type      : 'node'
                first     :
                    type : 'pdfjs'
                second    :
                    type : 'error'

    run_tex2pdf: (time) =>
        @run_latex(time, true)

    run_latex: (time, all_steps=false) =>
        time ?= @_last_save_time
        # TODO: should only run knitr if at least one frame is visible showing preview.
        @set_status('Running LaTeX...')
        @setState(build_log: undefined)
        tex2pdf.convert
            path       : @path
            project_id : @project_id
            time       : time
            cb         : (err, output) =>
                @set_status('')
                if err
                    @set_error(err)
                if output?.stdout?
                    output.parse = (new LatexParser(output.stdout, {ignoreDuplicates: true})).parse()
                @set_build_log(latex: output)
                @clear_gutter('Codemirror-latex-errors')
                update_gutters
                    path       : @path
                    log        : output.parse
                    set_gutter : (line, component) =>
                        @set_gutter_marker
                            line      : line
                            component : component
                            gutter_id : 'Codemirror-latex-errors'
                for x in ['pdfjs', 'embed', 'build_log']
                    @set_reload(x)


    run_bibtex: (time) =>
        time ?= @_last_save_time
        @set_status("Running BibTeX...")
        bibtex.bibtex
            path       : @path
            project_id : @project_id
            time       : time
            cb         : (err, output) =>
                @set_status('')
                if err
                    @set_error(err)
                @set_build_log(bibtex: output)

    run_sagetex: (time) =>
        time ?= @_last_save_time
        @set_status("Running SageTeX...")
        sagetex.sagetex
            path       : @path
            project_id : @project_id
            time       : time
            cb         : (err, output) =>
                @set_status('')
                if err
                    @set_error(err)
                @set_build_log(sagetex: output)

    set_build_log: (obj) =>
        build_log = @store.get('build_log') ? immutable.Map()
        for k, v of obj
            build_log = build_log.set(k, immutable.fromJS(v))
        @setState(build_log: build_log)

    run_clean: (time) =>
        log = ''
        @set_status("Cleaning up auxiliary files...")
        delete @_last_save_time
        @setState(build_log: immutable.Map())
        clean.clean
            path       : @path
            project_id : @project_id
            log        : (s) =>
                log += s
                build_log = @store.get('build_log') ? immutable.Map()
                build_log = build_log.set('clean', log)
                @setState(build_log : build_log)
            cb         : (err) =>
                @set_status('')
                if err
                    @set_error(err)

    build_action: (action) =>
        switch action
            when 'recompile'
                @run_tex2pdf(webapp_client.server_time())
            when 'latex'
                @run_latex(webapp_client.server_time())
            when 'bibtex'
                @run_bibtex(webapp_client.server_time())
            when 'sagetex'
                @run_sagetex(webapp_client.server_time())
            when 'clean'
                @run_clean()
            else
                @set_error("unknown build action '#{action}'")

    help: =>
        window.open(WIKI_HELP_URL, "_blank").focus()
