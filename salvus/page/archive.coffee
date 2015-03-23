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

async = require('async')

{defaults, required} = misc

templates = $(".smc-archive-templates")

exports.archive = (project_id, filename, editor) ->
    element = templates.find(".smc-archive-editor").clone()
    new Archive(project_id, filename, element, editor)
    return element

# For tar, see http://en.wikipedia.org/wiki/Tar_%28computing%29
COMMANDS =
    zip :
        list :
            command : 'unzip'
            args    : ['-l']
        extract :
            command : 'unzip'
            args    : ['-B']
    tar :
        list :
            command : 'tar'
            args    : ['-tf']
        extract :
            command : 'tar'
            args    : ['-xvf']
    gz :
        list :
            command : 'gzip'
            args    : ['-l']
        extract :
            command : 'gunzip'
            args    : ['-vf']
    bzip2 :
        list :
            command : 'ls'
            args    : ['-l']
        extract :
            command : 'bunzip2'
            args    : ['-vf']
    lzip :
        list :
            command : 'ls'
            args    : ['-l']
        extract :
            command : 'lzip'
            args    : ['-vfd']
    xz :
        list :
            command : 'xz'
            args    : ['-l']
        extract :
            command : 'xz'
            args    : ['-vfd']


class Archive
    constructor : (@project_id, @filename, @element, @editor) ->
        @element.data('archive', @)
        @element.find(".smc-archive-filename").text(@filename)
        @init (err) =>
            if not err
                @element.find("a[href=#extract]").removeClass('disabled').click () =>
                    @extract()
                    return false

    show: () =>
        @element.maxheight()

    parse_file_type: (file_info) =>
        # See editor.coffee, where we claim to handle these:
        #    zip gz bz2 z lz xz lzma tgz tbz tbz2 tb2 taz tz tlz txz lzip
        @element.find(".smc-archive-type").text(file_info)
        if file_info.indexOf('Zip archive data') != -1
            @file_type = 'zip'
        else if file_info.indexOf('tar archive') != -1
            @file_type = 'tar'
        else if file_info.indexOf('gzip compressed data') != -1
            @file_type = 'gz'
        else if file_info.indexOf('bzip2 compressed data') != -1
            @file_type = 'bzip2'
        else if file_info.indexOf('lzip compressed data') != -1
            @file_type = 'lzip'
        else if file_info.indexOf('XZ compressed data') != -1
            @file_type = 'xz'
        else
            return "Unsupported archive type -- '#{file_info}'\n\nYou might try using a terminal."
        return undefined

    init: (cb) =>
        #console.log("init")
        out = undefined
        async.series([
            (cb) =>
                #console.log("calling file")
                salvus_client.exec
                    project_id : @project_id
                    command    : "file"
                    args       : ["-z", "-b", @filename]
                    err_on_exit: true
                    cb         : (err, output) =>
                        if err
                            if err.indexOf('No such file or directory') != -1
                                err = "No such file or directory"
                            out = err
                            cb(err)
                        else
                            out = @parse_file_type(output.stdout.trim())
                            cb(out)
            (cb) =>
                @list_contents (err, contents) =>
                    if err
                        out = err
                    else
                        @contents = contents
                        out = contents
                    cb(err)
        ], (err) =>
            @element.find(".smc-archive-extract-contents").text(out)
            cb?(err)
        )

    list_contents: (cb) =>
        {command, args} = COMMANDS[@file_type].list
        #console.log("list_contents ", command, args)
        salvus_client.exec
            project_id : @project_id
            command    : command
            args       : args.concat([@filename])
            err_on_exit: false
            cb         : (err, out) =>
                if err
                    cb(err)
                else
                    cb(undefined, out.stdout + '\n' + out.stderr)

    extract: (cb) =>
        {command, args} = COMMANDS[@file_type].extract

        output = @element.find(".smc-archive-extract-output")
        error  = @element.find(".smc-archive-extract-error")
        output.text('')
        error.text('')
        @element.find("a[href=#extract]").icon_spin(start:true)
        s = misc.path_split(@filename)
        extra_args = []
        post_args = []
        async.series([
            (cb) =>
                if not @contents?
                    cb(); return
                if @file_type == 'zip'
                    # special case for zip files: if heuristically it looks like not everything is contained
                    # in a subdirectory with name the zip file, then create that subdirectory.
                    base = s.tail.slice(0, s.tail.length - 4)
                    if @contents.indexOf(base+'/') == -1
                        extra_args = ['-d', base]
                    cb()
                else if @file_type == 'tar'
                    # special case for tar files: if heuristically it looks like not everything is contained
                    # in a subdirectory with name the tar file, then create that subdirectory.
                    i = s.tail.lastIndexOf('.t')  # hopefully that's good enough.
                    base = s.tail.slice(0, i)
                    if @contents.indexOf(base+'/') == -1
                        post_args = ['-C', base]
                        salvus_client.exec
                            project_id : @project_id
                            path       : s.head
                            command    : "mkdir"
                            args       : ['-p', base]
                            cb         : cb
                    else
                        cb()
                else
                    cb()
            (cb) =>
                args = args.concat(extra_args).concat([s.tail]).concat(post_args)
                args_str = ((if x.indexOf(' ')!=-1 then "'#{x}'" else x) for x in args).join(' ')
                cmd = "cd #{s.head} ; #{command} #{args_str}"
                @element.find(".smc-archive-extract-cmd").show().text(cmd)
                salvus_client.exec
                    project_id : @project_id
                    path       : s.head
                    command    : command
                    args       : args
                    err_on_exit: false
                    cb         : (err, out) =>
                        #console.log("done extract: ", err, out)
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
                        cb(err)
        ], (err) =>
            cb?(err)
        )



