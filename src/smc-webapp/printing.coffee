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

    print: (opts) ->
        target_ext = misc.filename_extension(@output_file).toLowerCase()
        switch target_ext
            when 'pdf'
                salvus_client.print_to_pdf(opts)
            when 'html'
                @html(opts.cb)

    html: (cb) ->
        # the following fits mentally into sagews.SynchronizedWorksheet
        {MARKERS} = require('smc-util/sagews')
        html = [] # list of elements
        cm = @editor.codemirror
        input_lines = []
        input_lines_process = ->
            if input_lines.length > 0
                html.push("<pre>#{input_lines.join('\n')}</pre>")
                input_lines = []
        for line in [0...cm.lineCount()]
            x = cm.getLine(line)
            console.log "line", x
            marks = cm.findMarks({line:line, ch:0}, {line:line, ch:x.length})
            if not marks? or marks.length == 0
                # console.log 'no marks line', x
                input_lines.push(x)
            else
                input_lines_process()
                mark = marks[0]
                switch x[0]
                    when MARKERS.cell
                        x

                    when MARKERS.output
                        console.log 'output', mark
                        out = "<div class='output'>#{mark.widgetNode.innerHTML}</div>"
                        html.push(out)

        input_lines_process()
        html_data = (h for h in html).join('\n')

        salvus_client.write_text_file_to_project
            project_id : @editor.project_id
            path       : @output_file
            content    : html_data
            cb         : (err, resp) =>
                console.log err, resp
                @cb?(err, resp)

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
