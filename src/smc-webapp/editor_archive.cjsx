{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Button, Panel, Row, Col} = require('react-bootstrap')
{Icon} = require('./r_misc')
{salvus_client} = require('./salvus_client')
{filename_extension} = require('smc-util/misc')
async = require('async')
misc = require('smc-util/misc')

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

redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

init_redux = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, ArchiveActions)
    store   = redux.createStore(name)
    return name

remove_redux = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    redux.removeActions(name)
    redux.removeStore(name)
    return name

class ArchiveActions extends Actions
    parse_file_type : (file_info) ->
        if file_info.indexOf('Zip archive data') != -1
            return 'zip'
        else if file_info.indexOf('tar archive') != -1
            return 'tar'
        else if file_info.indexOf('gzip compressed data') != -1
            return 'gz'
        else if file_info.indexOf('bzip2 compressed data') != -1
            return 'bzip2'
        else if file_info.indexOf('lzip compressed data') != -1
            return 'lzip'
        else if file_info.indexOf('XZ compressed data') != -1
            return 'xz'
        return undefined

    set_archive_contents : (project_id, path) ->
        async.waterfall([
            # Get the file type data. Error if no file found.
            (waterfall_cb) =>
                ext = filename_extension(path)
                {command, args} = COMMANDS[ext].list

                salvus_client.exec
                    project_id : project_id
                    command    : command
                    args       : args.concat([path])
                    err_on_exit: false
                    cb         : (client_err, client_output) =>
                        waterfall_cb(client_err, ext, client_output)

        ], (err, ext, contents) =>
            if not err
                @setState
                    error    : err
                    contents : contents.stdout
                    type     : ext
        )

    extract_archive_files : (project_id, path, type, contents) ->
        {command, args} = COMMANDS[type].extract
        path_parts = misc.path_split(path)
        async.waterfall([
            (cb) =>
                if not contents?
                    cb("Archive not loaded yet")
                if type == 'zip'
                    # special case for zip files: if heuristically it looks like not everything is contained
                    # in a subdirectory with name the zip file, then create that subdirectory.
                    base = path_parts.tail.slice(0, path_parts.tail.length - 4)
                    if contents.indexOf(base+'/') == -1
                        extra_args = ['-d', base]
                    cb(undefined, extra_args, [])
                else if type == 'tar'
                    # special case for tar files: if heuristically it looks like not everything is contained
                    # in a subdirectory with name the tar file, then create that subdirectory.
                    i = path_parts.tail.lastIndexOf('.t')  # hopefully that's good enough.
                    base = path_parts.tail.slice(0, i)
                    if contents.indexOf(base+'/') == -1
                        post_args = ['-C', base]
                        salvus_client.exec
                            project_id : project_id
                            path       : path_parts.head
                            command    : "mkdir"
                            args       : ['-p', base]
                            cb         : =>
                                cb(undefined, [], post_args)
                else
                    cb(undefined, [], [])
            (extra_args, post_args, cb) =>
                args = args.concat(extra_args ? []).concat([path_parts.tail]).concat(post_args)
                args_str = ((if x.indexOf(' ')!=-1 then "'#{x}'" else x) for x in args).join(' ')
                cmd = "cd #{path_parts.head} ; #{command} #{args_str}"
                @setState(loading: true, command: cmd)
                salvus_client.exec
                    project_id : project_id
                    path       : path_parts.head
                    command    : command
                    args       : args
                    err_on_exit: false
                    timeout    : 120
                    cb         : (err, out) =>
                        @setState(loading: false)
                        cb(err, out)
        ], (err, output) =>
            @setState(error: err, extract_output: output.stdout)
        )

ArchiveContents = rclass
    render : ->
        if not @props.contents?
            @props.actions.set_archive_contents(@props.project_id, @props.path)
        <pre>{@props.contents}</pre>


Archive = rclass ({name}) ->
    reduxProps:
        "#{name}" :
            contents       : rtypes.string
            info           : rtypes.string
            type           : rtypes.string
            loading        : rtypes.bool
            command        : rtypes.string
            error          : rtypes.any
            extract_output : rtypes.string

    propTypes:
        path       : rtypes.string
        actions    : rtypes.object
        project_id : rtypes.string

    title : ->
        <tt><Icon name="file-zip-o" /> {@props.path}</tt>

    extract_archive_files : ->
        @props.actions.extract_archive_files(@props.project_id, @props.path, @props.type, @props.contents)

    render : ->
        <Panel header={@title()}>
            <Button bsSize='large' bsStyle='success' onClick={@extract_archive_files}><Icon name='folder' spin={@props.loading} /> Extract Files...</Button>
            {<pre>{@props.command}</pre> if @props.command}
            {<pre>{@props.extract_output}</pre> if @props.extract_output}
            {<pre>{@props.error}</pre> if @props.error}

            <h2>Contents</h2>

            {@props.info}
            <ArchiveContents path={@props.path} contents={@props.contents} actions={@props.actions} project_id={@props.project_id} />
        </Panel>

require('project_file').register_file_editor
    ext    : misc.split('zip gz bz2 z lz xz lzma tgz tbz tbz2 tb2 taz tz tlz txz lzip')
    icon   : 'file-archive-o'
    init      : init_redux
    component : Archive
    remove    : remove_redux
