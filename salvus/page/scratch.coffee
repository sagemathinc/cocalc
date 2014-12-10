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


############################################
# Scratch -- the salvus default scratchpad
############################################

set_evaluate_key = undefined # exported

(() ->
    misc_page = require('misc_page')
    
    {top_navbar} = require('top_navbar')
    {salvus_client} = require('salvus_client')

    mswalltime = require("misc").mswalltime

    persistent_session = null

    session = (cb) ->
        if persistent_session == null
            salvus_client.new_session
                limits: {}
                timeout: 10
                cb: (error, session) ->
                    if error
                        cb(true, error)
                    else
                        persistent_session = session
                        cb(false, persistent_session)
        else
            cb(false, persistent_session)


    $("#execute").click((event) -> execute_code())

    is_evaluate_key = misc_page.is_shift_enter

    set_evaluate_key = (keyname) ->
        switch keyname
            when "shift_enter"
                is_evaluate_key = misc_page.is_shift_enter
            when "enter"
                is_evaluate_key = misc_page.is_enter
            when "control-enter"
                is_evaluate_key = misc_page.is_ctrl_enter
            else
                is_evaluate_key = misc_page.is_shift_enter



    keydown_handler = (e) ->
        if is_evaluate_key(e)
            execute_code()
            return false

    top_navbar.on "switch_to_page-scratch", () ->
        $("#input").focus()
        $(".scratch-worksheet").focus()
        $(document).keydown(keydown_handler)

    top_navbar.on "switch_from_page-scratch", () ->
        $(document).unbind("keydown", keydown_handler)

    ######################################################################
    # extend Mercury for salvus: (note the online docs at
    # https://github.com/jejacks0n/mercury/wiki/Extending-Mercury are
    # out of date...)
    #

    # Make a jQuery plugin for executing the code in a cell
    $.fn.extend
        execute_cell: (opts) ->
            return @each () ->
                cell = $(this)
                # wrap input in sage-input
                input = this.innerText
                console.log("input='#{input}'")
                salvus_exec input, (mesg) ->
                    console.log(mesg)
                    if mesg.stdout?
                        cell.append($("<pre><span class='sage-stdout'>#{mesg.stdout}</span></pre>"))
                    if mesg.stderr?
                        cell.append($("<pre><span class='sage-stderr'>#{mesg.stderr}</span></pre>"))


    execute_code = () ->
        console.log('exec')
        input = window.getSelection().getRangeAt().startContainer.data
        output = window.getSelection().getRangeAt().endContainer
        console.log("evaluating: #{input}")
        r = input + "\n\n"
        salvus_exec(input, (mesg) ->
            console.log(mesg)
            r += mesg.stdout
            output.replaceWholeText(r))



    # TODO: this won't work when code contains ''' -- replace by a more sophisticated message to the sage server
    eval_wrap = (input, system) -> 'print ' + system + ".eval(r'''" + input + "''')"

    salvus_exec = (input, cb) ->
        session (error, s) ->
            if error
                console.log("ERROR GETTING SESSION")
                return
            system = $("#scratch-system").val()
            console.log("Evaluate using '#{system}'")
            switch system
                when 'sage'
                    preparse = true
                when 'python'
                    preparse = false
                    # nothing
                else
                    preparse = false
                    input = eval_wrap(input, system)
            s.execute_code
                code        : input
                cb          : cb
                preparse    : preparse

)()