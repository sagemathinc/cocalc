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
# Command line REPL session
############################################

execute_code_demo2 = null  # exported
interrupt_exec2 = null     # exported

(() ->

    {salvus_client} = require('salvus_client')
    {alert_message} = require('alerts')

    persistent_session = null

    execute_code_demo2 = () ->

        if persistent_session == null
            salvus_client.new_session
                limits: {}
                timeout: 10
                cb: (error, session) ->
                    if error
                        # failed to create session quickly enough -- give an error; user could try later.
                        alert_message(type:"error", message:error)
                    else
                        persistent_session = session
                        # we now have the session, so it makes sense to evaluate the code
                        execute_code_demo2()
            return  # can't evaluate the code yet -- will try again when the callback above succeeds

        i = $("#input2")
        o = $("#output2")
        if o.val() == ""
            o.val("\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n")  # hackish
        code = i.val()
        system = $("#demo2-system").val()

        o.val(o.val() + "#{system}: " + code.replace(/\n/g, "\n#{system}: ") + '\n')

        # refactor with demo1 -- not really important, since they are just demos...
        eval_wrap = (code, system) -> 'print ' + system + ".eval(r'''" + code + "''')"
        switch system
            when 'sage'
                preparse = true
            when 'python'
                preparse = false
                # nothing
            else
                preparse = false
                code = eval_wrap(code, system)

        i.val("")
        o.scrollTop(o[0].scrollHeight)
        persistent_session.execute_code(
            code : code
            cb   :(mesg) ->
                if mesg.stdout?
                    o.val(o.val() + mesg.stdout)
                    o.scrollTop(o[0].scrollHeight)
                if mesg.stderr?
                    o.val(o.val() + "!!!!\n" + mesg.stderr + "!!!!\n")
                    o.scrollTop(o[0].scrollHeight)
            preparse: preparse
        )

    interrupt_exec2 = () ->
        if persistent_session
            persistent_session.interrupt()

    $("#interrupt2").button().click(interrupt_exec2)

    controller.on "show_page_demo2", () ->
        $("#input2").focus()
)()

