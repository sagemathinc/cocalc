###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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


###########################
# TODO: I think this can be deleted
###########################

{salvus_client} = require('salvus_client')
{top_navbar} = require('top_navbar')
{alert_message} = require('alerts')
misc = require('misc')
client = require('client')
uuid = misc.uuid
required = misc.required
defaults = misc.defaults

page = $("#worksheet-cm")
templates = $(".worksheet-cm-templates")

input_gutter = $("<div class='worksheet-cm-cell-gutter-marker'>&nbsp;sage: </div>")
continue_gutter = $("<div class='worksheet-cm-cell-gutter-marker'>&nbsp;...</div>")

output_gutter = $("<div class='worksheet-cm-output-gutter'>&nbsp;</div>")

######################################
# activate control buttons
######################################
activate_buttons = () ->
    page.find("a[href='#worksheet-cm-execute_code']").click((e) -> execute_code(); return false)
    page.find("a[href='#worksheet-cm-interrupt_session']").button().click((e) -> interrupt_session(); return false)
    page.find("a[href='#worksheet-cm-introspect']").button().click((e) -> introspect(); return false)
    page.find("a[href='#worksheet-cm-restart_session']").button().click((e) -> restart_session(); return false)
    page.find("a[href='#worksheet-cm-delete_worksheet']").button().click((e) -> delete_worksheet(); return false)
    page.find("a[href='#worksheet-cm-save_worksheet']").button().click((e) -> save_worksheet(); return false)

activate_buttons()

######################################
# activate CodeMirror editor
######################################
e = templates.find(".worksheet-cm").clone().show().appendTo(page).find("textarea")
e.val('')
editor = CodeMirror.fromTextArea e[0],
    #lineNumbers  : true
    firstLineNumber: 0
    indentUnit   : 4
    tabSize      : 4
    lineWrapping : true
    undoDepth    : 200
    autofocus    : false
    gutters      : ['CodeMirror-linenumbers', 'worksheet-cm-cell-gutter']

##########################################################################
# A *block* is by definition a maximal sequence of lines starting with
# contiguous input lines (with no worksheet-cm-cell-gutter) followed
# by contiguous output lines (indicated by having a worksheet-cm-cell-gutter set to output_gutter).
##########################################################################
#
editor.is_output_line = (line) ->
    # TODO: check specifically what it is set to.
    editor.lineInfo(line).gutterMarkers?['worksheet-cm-cell-gutter']?

editor.block_info = (line) ->
    if not line?
        line = editor.getCursor().line

    # Return the block boundaries of the block that contains the given line.
    # The output is an object:
    result = {input:{from:{line:-1,ch:0}, to:{line:-1,ch:0}}, output:{from:{line:-1,ch:0}, to:{line:-1,ch:0}}}

    line_count = editor.lineCount()

    # 1. If line is in output, move back until not in output
    while editor.is_output_line(line) and line >= 1
        line -= 1
    # 2. Move back until at start of buffer or line right after output; record input from
    while line >= 1 and not editor.is_output_line(line-1)
        line -= 1
    result.input.from.line = line
    # 3. Move forward until hit output or end of buffer (record input to, output from)
    while line < line_count and not editor.is_output_line(line)
        line += 1

    result.input.to.line = line
    result.output.from.line = line
    # 4. Move forward until hit input or end of buffer (record output end).
    while line < line_count and editor.is_output_line(line)
        line += 1

    result.output.to.line = line

    return result

editor.insert_output = (opts) ->
    opts = defaults opts,
        value : required
        type  : 'stdout'
        bookmark: required
    if opts.value[opts.value.length-1] != "\n"
        opts.value += "\n"
    pos = opts.bookmark.find()
    if not pos?
        console.log("bookmark vanished!")
        return
    console.log("pos=#{misc.to_json(pos)}; insert_output('#{opts.value}')")

    num_lines = misc.substring_count(opts.value, '\n')
    if num_lines == 0
        num_lines += 1

    editor.replaceRange(opts.value, {line:pos.line, ch:0})

    for i in [pos.line...pos.line+num_lines]
        editor.addLineClass(i, "background", "worksheet-cm-#{opts.type}-background")
        editor.setGutterMarker(i, "worksheet-cm-cell-gutter", output_gutter.clone()[0])

    opts.bookmark.clear()
    return editor.setBookmark(line:pos.line+num_lines+1, ch:1)


execute_code = () ->
    {input, output} = editor.block_info()
    console.log(misc.to_json(input), misc.to_json(output))
    editor.replaceRange("\n", output.from, output.to)
    input_text = editor.getRange(input.from, input.to)
    console.log("execute_code: '#{input_text}'")

    console.log("should be: #{misc.to_json({line:output.from.line, ch:0})}")
    if editor.lineCount() <= output.from.line
        editor.replaceRange("\n", output.from)
    output_bookmark = editor.setBookmark({line:output.from.line, ch:0})
    new_cursor_pos = {line:output.from.line, ch:0}
    console.log(misc.to_json(new_cursor_pos), editor.lineCount())
    editor.setCursor(new_cursor_pos)

    console.log("bookmark pos = ", misc.to_json(output_bookmark.find()))
    salvus_exec
        input : input_text
        cb    : (mesg) ->
            console.log(misc.to_json(mesg))
            if mesg.stdout?
                output_bookmark = editor.insert_output(value:mesg.stdout, type:'stdout', bookmark:output_bookmark)
            if mesg.stderr?
                output_bookmark = editor.insert_output(value:mesg.stderr, type:'stderr', bookmark:output_bookmark)
            if mesg.done
                null  # TODO: do something involving changing a spinner or something
    return false

keydown_handler = (e) ->
    switch e.which
        when 13 # enter
            if e.shiftKey
                return execute_code()
        when 27 # escape = 27
            return interrupt_session()
        when 9  # tab key = 9
            return introspect()

top_navbar.on "switch_to_page-worksheet-cm", () ->
    $(document).keydown(keydown_handler)
    editor.refresh()
    setTimeout((() -> editor.focus()), 500)

top_navbar.on "switch_from_page-worksheet-cm", () ->
    $(document).unbind("keydown", keydown_handler)

# this doesn't work yet.
fix_error_line_numbers = (s, line) ->
    if "Error in lines " == s.slice(0,15)
        i = s.search('-')
        j = s.search('\n')
        start = parseInt(s.slice(15,i))
        end = parseInt(s.slice(i+1,j+1))
        console.log("start='#{start}'")
        console.log("end='#{end}'")
        console.log("line='#{line}'")
        start += line-2
        end += line-2
        s = s.slice(0,15) + ' ' + start + '-' + end + s.slice(j)
    return s

    # pos = editor.getCursor()
    # node = $("<img src='http://vertramp.org/framed.png'>").draggable()[0]
    # editor.replaceRange(output, {line:pos.line+1, ch:0})
    # editor.markText({line:pos.line+1,ch:0}, {line:pos.line+2,ch:0}, {className:"worksheet-cm-output", atomic:true, replacedWith:node})
    # editor.setCursor({line:pos.line+2,ch:0})
    # #widget = editor.addLineWidget(line, output)
    # #editor.setBookmark({line:pos.line, ch:0}, output)

introspect = () ->
    return true

######################################
# Saving/loading scratch worksheet
######################################
delete_worksheet = () ->
    return true

save_worksheet = () ->
    return true

######################################
# Managing connection to the backend
######################################

persistent_session = null

session = (cb) ->
    if persistent_session == null
        salvus_client.new_session
            limits: {walltime:600, cputime:60}
            timeout: 2
            cb: (error, session) ->
                if error
                    cb(true, error)
                else
                    persistent_session = session
                    cb(false, persistent_session)
    else
        cb(false, persistent_session)

interrupt_session = () ->
    if persistent_session
        persistent_session.interrupt()

restart_session = () ->
    if persistent_session
        persistent_session.kill()
        alert_message(type:"success", message:"Restarted your Sage session.  (WARNING: Your variables are no longer defined.)")
        persistent_session = null
        worksheet.find(".salvus-running").hide()

salvus_exec = (opts) ->
    opts = defaults opts,
        input: required
        cb: required
    session (error, s) ->
        if error
            alert_message(type:"error", message:"Unable to start a new Sage session.")
        else
            s.execute_code
                code        : opts.input
                cb          : opts.cb
                preparse    : true


