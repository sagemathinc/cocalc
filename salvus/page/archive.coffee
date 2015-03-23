###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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


misc            = require('misc')
{salvus_client} = require('salvus_client')
{alert_message} = require('alerts')

{defaults, required} = misc

templates = $(".smc-archive-templates")

exports.archive = (project_id, filename, editor) ->
    element = templates.find(".smc-archive-editor").clone()
    new Archive(project_id, filename, element, editor)
    return element

class Archive
    constructor : (@project_id, @filename, @element, @editor) ->
        @element.data('archive', @)
        @element.find(".smc-archive-filename").text(@filename)
        @element.find("a[href=#extract]").click () =>
            @extract()
            return false
        @init_contents()

    show: () =>
        @element.maxheight()

    init_contents: (cb) =>
        salvus_client.exec
            project_id : @project_id
            command    : "unzip"
            args       : ["-l", @filename]
            err_on_exit: false
            cb         : (err, out) =>
                if err
                    out = err
                else
                    out = out.stdout + '\n' + out.stderr
                @element.find(".smc-archive-extract-contents").text(out)
                cb?(err)

    extract: () =>
        output = @element.find(".smc-archive-extract-output")
        error  = @element.find(".smc-archive-extract-error")
        output.text('')
        error.text('')
        @element.find("a[href=#extract]").icon_spin(start:true)
        s = misc.path_split(@filename)
        salvus_client.exec
            project_id : @project_id
            path       : s.head
            command    : "unzip"
            args       : ["-B", s.tail]
            err_on_exit: false
            cb         : (err, out) =>
                @element.find("a[href=#extract]").icon_spin(false)
                if err
                    error.show()
                    error.text(err)
                else
                    if out.stdout
                        output.show()
                        output.text(out.stdout)
                    if out.stderr
                        error.show()
                        error.text(out.stderr)

