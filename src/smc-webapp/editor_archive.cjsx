###
(c) SageMath, Inc. 2016-2017
AGPLv3
###

{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Button, Panel, Row, Col} = require('react-bootstrap')
{ErrorDisplay, Icon, Loading} = require('./r_misc')
{webapp_client} = require('./webapp_client')
{filename_extension, filename_extension_notilde} = require('smc-util/misc')
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
    tgz :
        list :
            command : 'tar'
            args    : ['-tzf']
        extract :
            command : 'tar'
            args    : ['-xvzf']
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

COMMANDS.bz2 = COMMANDS.bzip2

redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

init_redux = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    if redux.getActions(name)?
        return  # already initialized
    store   = redux.createStore(name)
    actions = redux.createActions(name, ArchiveActions)
    actions.set_archive_contents(project_id, path)
    return name

remove_redux = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    redux.removeActions(name)
    redux.removeStore(name)
    return name

class ArchiveActions extends Actions
    parse_file_type: (file_info) =>
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

    set_unsupported: (ext) =>
        msg = <span>
                <b>WARNING:</b> Support for decompressing {ext} archives is not yet implemented{' '}
                (see <a href='https://github.com/sagemathinc/cocalc/issues/1720' target='_blank'>https://github.com/sagemathinc/cocalc/issues/1720</a>).
                <br/>
                Despite that, you can open up a Terminal ("Files" → "Create" dropdown, select "Terminal") and run the extraction command right there in the Linux shell.
              </span>
        @setState
            error    : msg
            contents : ''
            type     : ext

    set_archive_contents: (project_id, path) =>
        ext0 = filename_extension_notilde(path)?.toLowerCase()
        ext = filename_extension(path)?.toLowerCase()
        if ext0 != ext
            @setState(error: "Please rename the archive file to not end in a tilde.")
            return

        if not COMMANDS[ext]?.list?
            @set_unsupported(ext)
            return

        {command, args} = COMMANDS[ext].list

        webapp_client.exec
            project_id : project_id
            command    : command
            args       : args.concat([path])
            err_on_exit: true
            cb         : (err, output) =>
                @setState
                    error    : if err then <pre>{err}</pre>
                    contents : output?.stdout
                    type     : ext

    extract_archive_files: (project_id, path, type, contents) =>
        if not COMMANDS[type]?.extract?
            @set_unsupported(type)
            return
        {command, args} = COMMANDS[type].extract
        path_parts = misc.path_split(path)
        extra_args = post_args = []
        output = undefined
        @setState(loading: true)
        async.series([
            (cb) =>
                if not contents?
                    cb("Archive not loaded yet")
                else if type == 'zip'
                    # special case for zip files: if heuristically it looks like not everything is contained
                    # in a subdirectory with name the zip file, then create that subdirectory.
                    base = path_parts.tail.slice(0, path_parts.tail.length - 4)
                    if contents.indexOf(base+'/') == -1
                        extra_args = ['-d', base]
                    cb()
                else if type == 'tar'
                    # special case for tar files: if heuristically it looks like not everything is contained
                    # in a subdirectory with name the tar file, then create that subdirectory.
                    i = path_parts.tail.lastIndexOf('.t')  # hopefully that's good enough.
                    base = path_parts.tail.slice(0, i)
                    if contents.indexOf(base+'/') == -1
                        post_args = ['-C', base]
                        webapp_client.exec
                            project_id    : project_id
                            path          : path_parts.head
                            command       : "mkdir"
                            args          : ['-p', base]
                            error_on_exit : true
                            cb            : cb
                    else
                        cb()
                else
                    cb()
            (cb) =>
                args = args.concat(extra_args ? []).concat([path_parts.tail]).concat(post_args)
                args_str = ((if x.indexOf(' ')!=-1 then "'#{x}'" else x) for x in args).join(' ')
                cmd = "cd \"#{path_parts.head}\" ; #{command} #{args_str}"  # ONLY for info purposes -- not actually run!
                @setState(command: cmd)
                webapp_client.exec
                    project_id : project_id
                    path       : path_parts.head
                    command    : command
                    args       : args
                    err_on_exit: true
                    timeout    : 120
                    cb         : (err, _output) =>
                        output = _output
                        cb(err)
        ], (err) =>
            @setState
                error          : err
                extract_output : output?.stdout
                loading        : false
        )

ArchiveContents = rclass
    propTypes:
        path       : rtypes.string.isRequired
        project_id : rtypes.string.isRequired
        contents   : rtypes.string

    render: ->



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
        actions    : rtypes.object.isRequired
        path       : rtypes.string.isRequired
        project_id : rtypes.string.isRequired

    title: ->
        <tt><Icon name="file-zip-o" /> {@props.path}</tt>

    extract_archive_files: ->
        @props.actions.extract_archive_files(@props.project_id, @props.path, @props.type, @props.contents)

    render_button_icon: ->
        if @props.loading
            <Icon name='cc-icon-cocalc-ring' spin={true} />
        else
            <Icon name='folder'/>

    render_button: ->
        <Button
            disabled = {!!@props.error or @props.loading}
            bsSize   = 'large'
            bsStyle  = 'success'
            onClick  = {@extract_archive_files}>
                {@render_button_icon()} Extract Files...
        </Button>

    render_error: ->
        if @props.error
            <div>
                <br />
                <ErrorDisplay
                    error_component = {@props.error}
                    style           = {maxWidth: '100%'}
                />
            </div>

    render_contents: ->
        if @props.error
            return
        <div>
            <h2>Contents</h2>

            {@props.info}
            <ArchiveContents path={@props.path} contents={@props.contents} project_id={@props.project_id} />
        </div>

    render_command: ->
        if @props.command
            <pre style={marginTop:'15px'}>{@props.command}</pre>

    render_extract_output: ->
        if @props.extract_output
            <pre style={marginTop:'15px'}>{@props.extract_output}</pre>

    render: ->
        if not @props.contents? and not @props.error?
            return <Loading />
        <Panel header={@title()}>
            {@render_button()}
            <br /><br/>
            {@render_command()}
            {@render_extract_output()}
            {@render_error()}
            <pre>{@props.contents}</pre>
        </Panel>

# TODO: change ext below to use misc.keys(COMMANDS).  We don't now, since there are a
# ton of extensions that shoud open in the archive editor, but aren't implemented
# yet and we don't want to open those in codemirror -- see https://github.com/sagemathinc/cocalc/issues/1720
TODO_TYPES = misc.split('z lz lzma tgz tbz tbz2 tb2 taz tz tlz txz')
require('project_file').register_file_editor
    ext       : misc.keys(COMMANDS).concat(TODO_TYPES)
    icon      : 'file-archive-o'
    init      : init_redux
    component : Archive
    remove    : remove_redux
