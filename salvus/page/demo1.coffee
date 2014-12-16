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
# Demo 1 -- a single script: Execute the code that is in the #input box
############################################

mswalltime = require("misc").mswalltime

execute_code_demo1 = () ->
    $("#output").val("")
    $("#time").html("")
    $("#run_status").html("running...")
    t0 = mswalltime()
    code = $("#input").val()
    system = $("#demo1-system").val()
    
    # TODO: this won't work when code contains ''' -- replace by a more sophisticated message to the sage server
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
    
    salvus.execute_code(
        code  : code
        cb    : (mesg) ->
            $("#time").html("#{mswalltime() - t0} ms") 
            o = $("#output")
            o.val(o.val() + mesg.stdout)
            if mesg.stderr
                o.val(o.val() + "\n!!!!!!!!!!!!!!\n#{mesg.stderr}\n!!!!!!!!!!!!!\n") 
            $("#run_status").html(if mesg.done then "" else "running...")
        preparse : preparse
        allow_cache : $("#script-cache").is(':checked')
    )


controller.on "show_page_demo1", () ->
    $("#input").focus()
    

