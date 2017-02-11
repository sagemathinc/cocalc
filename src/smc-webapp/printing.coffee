###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014--2016, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################
# This is a collection of utility classes for printing documents.
# They encapsulate the conversion logic, such that they can be used in editors.
###############################################################################

_               = require('underscore')
async           = require('async')
misc            = require('smc-util/misc')
{salvus_client} = require('./salvus_client')
{redux}         = require('./smc-react')
{project_tasks} = require('./project_tasks')
markdown        = require('./markdown')

# abstract class
class Printer
    constructor : (@editor, @output_file, @opts) ->
        @project_id = @editor.project_id

    # overwrite with the list of supported extensions
    @supported : []

    print : (cb) ->
        console.error('printing: Printer.print method needs to be subclassed')

    show_print_new_tab : (cb) ->
        # if the output file exists and has nonzero size, we open it in a new tab and print it
        project_tasks(@project_id).file_nonzero_size
            path        : @output_file
            cb          : (err) =>
                if err
                    cb?('Generated file for printing does not exist.')
                else
                    redux.getProjectActions(@project_id).download_file
                        path : @output_file
                        print: true
                    cb?()

class PandocPrinter extends Printer
    @supported : ['md', 'html', 'htm', 'rst', 'wiki', 'mediawiki', 'txt'] # , 'csv']

    print: (cb) =>
        @convert_to_pdf (err) =>
            if err
                cb?(err)
            else
                @show_print_new_tab(cb)

    convert_to_pdf: (cb) =>  # cb(err, {stdout:?, stderr:?})
        # this assumes that the outputfile is in the same directory
        infile  = misc.path_split(@editor.filename)
        outfile = misc.path_split(@output_file)

        if @editor.ext in PandocPrinter.supported
            # pandoc --latex-engine=xelatex a.wiki -o a.pdf
            command = 'pandoc'
            args    = ['--latex-engine=xelatex']
            # --wrap=preserve doesn't exist in our old pandoc version
            #if @editor.ext in ['txt', 'csv']
            #    args.push('--wrap=preserve')
            args = args.concat([infile.tail, '-o', outfile.tail])
            bash = false
        else
            cb("'*.#{@editor.ext}' files are currently not supported.")

        output = undefined
        editor = @editor
        async.series([
            (cb) =>
                editor.save(cb)
            (cb) =>
                salvus_client.exec
                    project_id  : editor.project_id
                    command     : command
                    args        : args
                    err_on_exit : true
                    bash        : bash
                    path        : infile.head
                    cb          : (err, o) =>
                        if err
                            cb(err)
                        else
                            output = o
                            cb()
        ], (err) =>
            if err
                cb?(err)
            else
                cb?(undefined, output)
        )

class LatexPrinter extends Printer
    @supported : ['tex']

    print: () ->
        @show_print_new_tab()

class SagewsPrinter extends Printer
    @supported : ['sagews']

    print: (cb, progress) ->
        # cb: callback when done, usual err pattern
        # progress: callback to signal back messages about the conversion progress
        target_ext = misc.filename_extension(@output_file).toLowerCase()
        try
            switch target_ext
                when 'pdf'
                    salvus_client.print_to_pdf(cb)
                when 'html'
                    @html(cb, progress)
        catch e
            err = "Exception trying to print to #{target_ext} -- #{e}"
            console.error(err, e)
            console.trace()
            {reportException} = require('webapp-lib/webapp-error-reporter')
            reportException(e, null, 'warning', 'SagewPrinter.print: '+ err)
            cb(err)

    generate_html: (data) ->
        if not @_html_tmpl?
            # recycle our mathjax config from last.coffee
            {MathJaxConfig} = require('./last')
            MathJaxConfig = _.clone(MathJaxConfig)
            MathJaxConfig.skipStartupTypeset = false
            MathJaxConfig.showProcessingMessages = true
            MathJaxConfig.CommonHTML ?= {}
            MathJaxConfig.CommonHTML.scale = 80
            MathJaxConfig["HTML-CSS"] ?= {}
            MathJaxConfig["HTML-CSS"].scale = 80

            SiteName = redux.getStore('customize').site_name ? 'SageMathCloud'
            if window?
                loc = window.location
                {join} = require('path')
                url = "#{loc.protocol}//" + join(loc.hostname, window.smc_base_url ? '')
            else
                url = 'https://cloud.sagemath.com/'

            # note to a future reader: the <meta data-name="smc-generated" ... > uniquely tags this document for detection.
            # e.g. this can be used to import it later on
            # version 1: no embedded file
            # versoin 2: embedded into "a[download]:first"
            @_html_tmpl = """
                <!doctype html>
                <html lang="en">
                <head>
                    <meta charset="utf-8">

                    <title>#{data.title}</title>
                    <meta name="description" content="automatically generated from '#{data.project_id}:#{data.filename}' on SageMathCloud">
                    <meta name="date" content="#{data.timestamp}">
                    <meta data-name="smc-generated" content="version:2">

                    <style>
                        html {
                            font-family: sans-serif;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0; padding: 0;
                        }
                        body {
                            width: 50rem;
                            counter-reset: line;
                            padding: .5rem;
                        }
                        @media print {
                          body { width: 100%; margin: 1rem 1rem 1rem 6rem; font-size: 10pt; }
                        }
                        pre { margin: 0; }
                        div.output + pre.input { margin-top: 1rem; }
                        div.output {
                            border-left: .2rem solid #33a;
                            padding: .3rem;
                            margin-left: -.5rem;
                            line-height: 1.5;
                        }
                        div.output img {
                            max-width: 70%;
                            width: auto;
                            height: auto;
                        }
                        div.output.stdout,
                        div.output.stderr,
                        div.output.javascript { font-family: monospace; white-space: pre-wrap; }
                        div.output.stderr { color: #F00; border-color: #F33; }

                        span.sagews-output-image > img,
                        span.sagews-output-html > img
                        { vertical-align: top; }

                        pre.input {
                            border-left: .2rem solid #3a3;
                            padding: .5rem;
                            margin-left: -.5rem;
                        }
                        pre.input > code {
                            display: block;
                            line-height: 1.1rem;
                        }
                        pre.input > code:before {
                            margin-left: -3rem;
                            counter-increment: line;
                            content: counter(line);
                            display: inline-block;
                            padding: 0 .3rem 0 0;
                            margin-right: .5rem;
                            color: #888;
                            min-width: 2rem;
                            text-align: right;
                            user-select: none;
                        }
                        div.header { margin-bottom: 1rem; }
                        table.header td { border: 0; }
                        table.header tr>td:nth-child(2) {
                            font-weight: bold;
                            font-family: monospace;
                        }
                        table {
                            border-spacing: 0;
                            border-collapse: collapse;
                            margin-top: .5rem;
                            margin-bottom: .5rem;
                            border-color: #888;
                        }
                        table td, table th {
                            padding: .5rem;
                        }
                        table tr>td {
                            vertical-align: top;
                            border-top: .05rem solid #888;
                        }
                        table tr>th {
                            vertical-align: bottom;
                            border-bottom: .1rem solid #888;
                        }
                        footer {
                            margin-top: 1rem;
                            border-top: .1rem solid #888;
                            font-size: 70%;
                            color: #888;
                            text-align: center;
                        }
                    </style>


                    <!-- the styling of the highlighted code; should be printer friendly -->
                    <style>
                        .cm-keyword { font-weight: bold; color: #339; }
                        .cm-atom { color: #666; }
                        .cm-number { color: #333; }
                        .cm-def { color: #333; font-weight: bold; }
                        .cm-variable { color: black; }
                        .cm-variable-2 { color:black; }
                        .cm-variable-3 { color: black; }
                        .cm-property { color: black; }
                        .cm-operator { color: black; font-weight: bold; }
                        .cm-comment { color: #777; }
                        .cm-string { color: #333; }
                        .cm-meta { color: #039; }
                        .cm-qualifier { color: #666; }
                        .cm-builtin { color: #393; font-weight: bold; }
                        .cm-bracket { color: #666; }
                        .cm-tag { color: #444; font-weight: bold; }
                        .cm-attribute { color: #777; }
                        .cm-error { color: #000; }
                        .cm-header { font-weight: bold; }
                        .cm-header-1 { font-size: 1.2rem; }
                        .cm-header-2 { font-size: 1.15rem; }
                        .cm-header-3 { font-size: 1.12rem; }
                        .cm-header-4 { font-size: 1.1rem; }
                        .cm-header-5 { font-size: 1rem; }
                        .cm-em { font-style: italic; }
                        .cm-strong { font-weight: bold; }
                    </style>

                    <script type="text/javascript">window.MathJax = #{misc.to_json(MathJaxConfig)};</script>
                    <script type="text/javascript" async
                        src="https://cdn.mathjax.org/mathjax/latest/MathJax.js?config=TeX-AMS_HTML">
                    </script>
                </head>

                <body>
                <div class="header">
                    <h1>#{data.title}</h1>
                    <table class="header">
                    <tr><td>Author</td><td>#{data.author}</td></tr>
                    <tr><td>Date</td><td>#{data.timestamp}</td></tr>
                    <tr><td>Project</td><td>#{data.project_id}</td></tr>
                    <tr><td>Location</td><td><a href="#{data.file_url}">#{data.filename}</a></td></tr>
                    <tr><td>Original file</td><td><a href="#{data.sagews_data}" download="#{data.basename}">#{data.basename}</td></tr>
                    <script type="text/javascript">
                    var is_chrome = navigator.userAgent.indexOf('Chrome') > -1;
                    var is_safari = navigator.userAgent.indexOf("Safari") > -1;
                    if (is_safari && !is_chrome) {
                        document.write("<tr><td colspan='2'>(when downloading, rename file to #{data.basename})</td></tr>");
                    }
                    </script>
                    </table>
                </div>
                #{data.content}
                <footer>
                    <div>generated #{data.timestamp} on
                    <a href="#{url}">#{SiteName}</a>
                    </div>
                </footer>
                </body>
                </html>"""
        return @_html_tmpl

    html_process_output_mesg: (mesg, mark) ->
        out = null
        # console.log 'html_process_output_mesg', mesg, mark
        if mesg.stdout?
            # assertion: for stdout, `mark` might be undefined
            out = "<div class='output stdout'>#{mesg.stdout}</div>"
        else if mesg.stderr?
            out = "<div class='output stderr'>#{mesg.stderr}</div>"
        else if mesg.html?
            $html = $("<div>#{mesg.html}</div>")
            @editor.syncdoc.process_html_output($html)
            out = "<div class='output html'>#{$html.html()}</div>"
        else if mesg.md?
            x = markdown.markdown_to_html(mesg.md)
            $out = $("<div>")
            $out.html_noscript(x.s) # also, don't process mathjax!
            @editor.syncdoc.process_html_output($out)
            out = "<div class='output md'>#{$out.html()}</div>"
        else if mesg.interact?
            out = "<div class='output interact'>#{mark.widgetNode.innerHTML}</div>"
        else if mesg.file?
            if mesg.file.show ? true
                ext = misc.filename_extension(mesg.file.filename).toLowerCase()
                if ext == 'sage3d'
                    for el in $(mark.replacedWith).find(".salvus-3d-container")
                        $3d = $(el)
                        scene = $3d.data('salvus-threejs')
                        if not scene?
                            # when the document isn't fully processed, there is no scene data
                            continue
                        scene.set_static_renderer()
                        data_url = scene.static_image
                        out ?= ''
                        out += "<div class='output sage3d'><img src='#{data_url}'></div>"
                else if ext == 'webm'
                    out ?= ''
                    # 'raw' url. later, embed_videos will be replace by the data-uri if there is no error
                    out += "<video src='#{mesg.file.url}' class='sagews-output-video' controls></video>"
                else
                    # console.log 'msg.file', mark, mesg
                    if not @_output_ids[mark.id] # avoid duplicated outputs
                        @_output_ids[mark.id] = true
                        # console.log "output.file", mark, mesg
                        $images = $(mark.widgetNode)
                        for el in $images.find('.sagews-output-image')
                            out ?= ''
                            # innerHTML should just be the <img ... > element
                            out += el.innerHTML
                        out = "<div class='output image'>#{out}</div>"
        else if mesg.code?  # what's that actually?
            code = mesg.code.source
            out = "<pre><code>#{code}</code></pre>"
        else if mesg.javascript?
            # mesg.javascript.coffeescript is true iff coffeescript
            $output = $(mark.replacedWith)
            $output.find('.sagews-output-container').remove() # TODO what's that?
            out = "<div class='output javascript'>#{$output.html()}</div>"
        else if mesg.done?
            # ignored
        else
            console.warn "ignored mesg", mesg
        return @html_post_process(out)

    html_post_process: (html) ->
        # embedding images and detecting a title
        if not html?
            return html
        $html = $('<div>').html(html)
        if not @_title
            for tag in ['h1', 'h2', 'h3']
                $hx = $html.find(tag + ':first')
                if $hx.length > 0
                    @_title = $hx.text()
                    break
        for img in $html.find('img')
            if img.src.startsWith('data:')
                continue
            c          = document.createElement("canvas")
            scaling    = img.getAttribute('smc-image-scaling') ? 1
            c.width    = img.width
            c.height   = img.height
            c.getContext('2d').drawImage(img, 0, 0)
            img.width  = scaling * img.width
            img.height = scaling * img.height
            ext = misc.filename_extension(img.src).toLowerCase()
            ext = ext.split('?')[0]
            ext = if ext == 'jpg' then 'jpeg' else ext
            if ext == 'svg'
                ext = 'svg+xml'
            else if ext in ['png', 'jpeg']
                _
            else
                console.warn("printing sagews2html image file extension of '#{img.src}' not supported")
                continue
            try
                img.src = c.toDataURL("image/#{ext}")
            catch e
                # ignore a potential CORS security error, when the image comes from another domain.
                # SecurityError: Failed to execute 'toDataURL' on 'HTMLCanvasElement': Tainted canvases may not be exported.
                console.info('ignoring CORS error regarding reading the image content via "toDataURL"')
                continue
        return $html.html()

    html: (cb, progress) ->
        # the following fits mentally into sagews.SynchronizedWorksheet
        # progress takes two arguments: a float between 0 and 1 [%] and optionally a message
        {MARKERS}    = require('smc-util/sagews')
        _html        = [] # list of elements
        full_html    = '' # end result of html content
        @_title      = null # for saving the detected title
        @_output_ids = {} # identifies text marker elements, to avoid printing show-plots them more than once!
        cm           = @editor.codemirror
        progress     ?= _.noop

        # canonical modes in a sagews
        {sagews_decorator_modes} = require('./editor')
        canonical_modes = _.object(sagews_decorator_modes)

        # cell input lines are collected first and processed once lines with markers appear (i.e. output)
        # the assumption is, that default_mode extends to all the consecutive cells until the next mode or default_mode
        input_lines              = []
        input_lines_mode         = null
        input_lines_default_mode = 'python'

        canonical_mode = (mode) ->
            canonical_modes[mode] ? input_lines_default_mode

        detect_mode = (line) ->
            line = line.trim()
            if line.startsWith('%') # could be %auto, %md, %auto %default_mode, ...
                i = line.indexOf('%default_mode')
                if i >= 0
                    input_lines_default_mode = canonical_mode(line[i..].split(/\s+/)[1])
                else
                    mode = line.split(" ")[0][1..] # worst case, this is an empty string
                    if _.has(canonical_modes, mode)
                        input_lines_mode = canonical_mode(mode)

        process_line = (line) ->
            detect_mode(line)
            # each line is in <code> because of the css line numbering
            code = document.createElement('code')
            mode = input_lines_mode ? input_lines_default_mode
            CodeMirror.runMode(line, mode, code)
            return code.outerHTML

        input_lines_process = (final = false) =>
            # final: if true, filter out the empty lines at the bottom
            while final and input_lines.length > 0
                line = input_lines[input_lines.length - 1]
                if line.length == 0
                    input_lines.pop()
                else
                    break
            if input_lines.length > 0
                input_lines = input_lines.map(process_line).join('') # no \n linebreaks!
                #_html.push("<div class='mode'>#{input_lines_mode ? input_lines_default_mode} mode")
                _html.push("<pre class='input'>#{input_lines}</pre>")
            input_lines      = []
            input_lines_mode = null

        # stdout mesg can be split up into multiple parts -- this is a helper for collecting them
        mesg_stdout = {stdout : ''}
        process_collected_mesg_stdout = =>
            # processing leftover stdout mesgs from previous iteration
            if mesg_stdout.stdout.length > 0
                # it's ok to leave `mark` undefined
                om = @html_process_output_mesg(mesg_stdout)
                _html.push(om) if om?
                mesg_stdout = {stdout : ''}

        process_lines = (cb) =>
            # process lines in an async loop to avoid blocking on large documents
            line = 0
            lines_total = cm.lineCount()
            while line < lines_total
                progress(.1 + .8 * line / lines_total, "Converting line #{line}")
                x = cm.getLine(line)
                marks = cm.findMarks({line:line, ch:0}, {line:line, ch:x.length})
                if not marks? or marks.length == 0
                    input_lines.push(x)
                else
                    input_lines_process()
                    mark = marks[0] # assumption it's always length 1
                    switch x[0]     # first char is the marker
                        when MARKERS.cell
                            _
                        when MARKERS.output
                            # assume, all cells are evaluated and hence mark.rendered contains the html
                            for mesg_ser in mark.rendered.split(MARKERS.output)
                                if mesg_ser.length == 0
                                    continue
                                try
                                    mesg = misc.from_json(mesg_ser)
                                catch e
                                    console.warn("invalid output message '#{m}' in line '#{line}'")
                                    continue

                                if mesg.stdout?
                                    mesg_stdout.stdout += mesg.stdout
                                else
                                    process_collected_mesg_stdout()
                                    # process the non-stdout mesg from this iteration
                                    # console.log 'output message', mesg, mark
                                    om = @html_process_output_mesg(mesg, mark)
                                    _html.push(om) if om?

                process_collected_mesg_stdout()
                line++
            input_lines_process(final = true)
            # combine all html snippets to one html block
            full_html = (h for h in _html).join('\n')
            cb()

        sagews_data = (cb) =>
            dl_url = salvus_client.read_file_from_project
                project_id  : @editor.project_id
                path        : @editor.filename

            data_base64 = null
            f = (cb) ->
                $.get(dl_url).done((data) ->
                    # console.log "data", data
                    data_enc = window.btoa(window.unescape(encodeURIComponent(data)))
                    data_base64 = 'data:application/octet-stream;base64,' + data_enc
                    cb(null)
                ).fail(-> cb(true))

            misc.retry_until_success
                f         : f
                max_time  : 60*1000
                cb        : (err) ->
                    cb(err, data_base64)

        $html = null
        embed_videos = (cb) =>
            # downloading and embedding all video files (especially for animations)
            # full_html is a string and we have to wrap this into a div
            $html = $('<div>' + full_html + '</div>')
            vids = (vid for vid in $html.find('video'))
            vids_num = 0
            vids_tot = vids.length
            vembed = (vid, cb) ->
                # console.log "embedding #{vids_num}/#{vids_tot}", vid
                vids_num += 1
                progress(.4 + (5 / 10) * (vids_num / vids_tot), "video #{vids_num}/#{vids_tot}")
                xhr = new XMLHttpRequest()
                xhr.open('GET', vid.src)
                xhr.responseType = 'blob'
                xhr.onreadystatechange = ->
                    if this.readyState == 4  # it's DONE
                        if this.status == 200  # all OK
                            blob = this.response
                            reader = new FileReader()
                            reader.addEventListener "load", ->
                                # console.log(reader.result[..100])
                                vid.src = reader.result
                                cb(null)
                            reader.readAsDataURL(blob)
                        else
                            # error handling
                            cb("Error embedding video: HTTP status #{this.status}")
                xhr.send()
            async.mapLimit vids, 2, vembed, (err, results) ->
                full_html = $html.html()
                cb(err)

        finalize = (err, results) =>
            data = results[0]
            if err
                cb?(err)
                return
            if not data?
                cb?('Unable to download and serialize the Sage Worksheet.')
                return

            file_url = project_tasks(@editor.project_id).url_fullpath(@editor.filename)
            content = @generate_html
                title       : @_title ? @editor.filename
                filename    : @editor.filename
                content     : full_html
                timestamp   : "#{(new Date()).toISOString()}".split('.')[0]
                project_id  : @editor.project_id
                author      : redux.getStore('account').get_fullname()
                file_url    : file_url
                basename    : misc.path_split(@editor.filename).tail
                sagews_data : data

            progress(.95, "Saving to #{@output_file} ...")
            salvus_client.write_text_file_to_project
                project_id : @editor.project_id
                path       : @output_file
                content    : content
                cb         : (err, resp) =>
                    console.debug("write_text_file_to_project.resp: '#{resp}'")
                    cb?(err)

        # parallel is tempting, but videos depend on process lines
        async.series([sagews_data, process_lines, embed_videos], finalize)

# registering printers
printers = {}
for printer_cls in [PandocPrinter, LatexPrinter, SagewsPrinter]
    for ext in printer_cls.supported
        printers[ext] = printer_cls

###
# Public API
# Printer, usually used like that:
#   p = Printer(@, input_file, output_file, opts)
#   p.print(cb)
#
# can_print(ext) → true or false
###

# returns the printer class for a given file extension
exports.Printer = (editor, output_file, opts) ->
    ext = misc.filename_extension_notilde(editor.filename).toLowerCase()
    return new printers[ext](editor, output_file, opts)

# returns true, if we know how to print it
exports.can_print = (ext) ->
    return _.has(printers, ext)
