{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Button, Panel, Row, Col} = require('react-bootstrap')
{Icon} = require('./r_misc')
{salvus_client} = require('./salvus_client')
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
                salvus_client.exec
                    project_id : project_id
                    command    : "file"
                    args       : ["-z", "-b", path]
                    err_on_exit: true
                    cb         : (err, info) =>
                        if err
                            if err.indexOf('No such file or directory') != -1
                                err = "No such file or directory"
                        waterfall_cb(err, info)
            # Get the file type. Error if file type not supported.
            (info, waterfall_cb) =>
                if not info?.stdout?
                    cb("Unsupported archive type.\n\nYou might try using a terminal.")
                type = @parse_file_type(info.stdout)
                if not type?
                    cb("Unsupported archive type -- #{info.stdout} \n\nYou might try using a terminal.", info)
                waterfall_cb(undefined, info, type)
            # Get archive contents. Error if unable to read archive.
            (info, type, waterfall_cb) =>
                {command, args} = COMMANDS[type].list

                salvus_client.exec
                    project_id : project_id
                    command    : command
                    args       : args.concat([path])
                    err_on_exit: false
                    cb         : (client_err, client_output) =>
                        waterfall_cb(client_err, info, type, client_output)

        ], (err, info, type, contents) =>
            if not err
                @setState
                    error    : err
                    info     : info.stdout
                    contents : contents.stdout
                    type     : type
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

exports.init_redux = init_redux = (redux, project_id, filename) ->
    name = redux_name(project_id, filename)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, ArchiveActions)
    store   = redux.createStore(name)

ArchiveContents = rclass
    render : ->
        if not @props.contents?
            @props.actions.set_archive_contents(@props.project_id, @props.path)
        <pre>{@props.contents}</pre>


Archive = (name) -> rclass
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

render = (redux, project_id, path) ->
    name = redux_name(project_id, path)
    actions = redux.getActions(name)
    Archive_connected = Archive(name)
    <Redux redux={redux}>
        <Archive_connected path={path} actions={actions} project_id={project_id} />
    </Redux>

exports.free = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.render = (project_id, path, dom_node, redux) ->
    init_redux(redux, project_id, path)
    ReactDOM.render(render(redux, project_id, path), dom_node)

exports.hide = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, path, dom_node, redux) ->
    ReactDOM.render(render(redux, project_id, path), dom_node)