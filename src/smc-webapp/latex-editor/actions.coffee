###
LaTeX Editor Actions
###

immutable       = require('immutable')

{Actions}       = require('../code-editor/actions')
tex2pdf         = require('./tex2pdf')
{webapp_client} = require('../webapp_client')
maintenance     = require('./maintenance')

class exports.Actions extends Actions
    _init: (args...) =>
        super._init(args...)   # call the _init for the parent class
        if not @is_public  # one extra thing after markdown.
            @_init_tex2pdf()
            @_init_spellcheck()

    _init_tex2pdf: =>
        @_syncstring.on('save-to-disk', @run_tex2pdf)
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
                    type : 'build'

    run_tex2pdf: (time) =>
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
                @setState(build_log: {latex:output})  # later there might also be output from a sage step, etc.
                for x in ['pdfjs', 'embed', 'build_log']
                    @set_reload(x)

    run_latex: (time) =>

    run_bibtex: (time) =>

    run_sagetex: (time) =>

    run_clean: (time) =>
        log = ''
        @set_status("Cleaning up auxiliary files...")
        @setState(build_log: immutable.Map())
        maintenance.clean
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