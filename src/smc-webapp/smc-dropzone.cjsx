#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Drag'n'Drop dropzone area
###


# TODO: make it so that whenever we mount this component, the max size is set based
# on known info about free disk space...

MAX_FILE_SIZE_MB    = 3000 # 3GB for now, since that's the default filesystem quota.
CHUNK_SIZE_MB       = 32   # critical for cloudlare to work -- want this to be as big
                           # as possible, but MUST be smaller than 200MB, and also
                           # must be uploadable in less than 100 seconds.
###
The internet says "The average U.S. fixed broadband download speed was 64.17 Mbps (15th in the world) in the first
half of 2017, while the average upload speed was 22.79 Mbps (24th in the world), according to data released
today from internet speed test company Ookla". 23 Mbps is about 4MB/s.  If a user can do 1MB/s, then they can
upload 100MB in 100 seconds, hence 32MB in 100 seconds seems a reasonable assumption....  If it really takes over
a minute to upload 32MB, then the user isn't going to upload a very big file anyways, given TIMEOUT_M.
###

ReactDOMServer      = require('react-dom/server')   # for dropzone below
Dropzone            = require('dropzone')
{DropzoneComponent} = require('react-dropzone-component')

misc           = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes, redux} = require('./app-framework')

{Icon, Tip} = require('./r_misc')
os_path = require('path')

Dropzone.autoDiscover = false

DROPSTYLE =
    border       : '2px solid #ccc'
    boxShadow    : '4px 4px 2px #bbb'
    borderRadius : '5px'
    padding      : 0
    margin       : '10px 0'

render_header = ->
    <Tip
        icon      = 'file'
        title     = 'Drag and drop files'
        placement = 'bottom'
        tip       = 'Drag and drop files from your computer into the box below to upload them into your project.'>
        <h4 style={color:"#666"}>
            Drag and drop files
        </h4>
    </Tip>


exports.SMC_Dropzone = rclass
    displayName: 'SMC_Dropzone'

    propTypes:
        project_id           : rtypes.string.isRequired
        current_path         : rtypes.string.isRequired
        dropzone_handler     : rtypes.object.isRequired
        close_button_onclick : rtypes.func
        show_header          : rtypes.bool

    getDefaultProps: ->
        show_header          : true

    dropzone_template : ->
        <div className='dz-preview dz-file-preview'>
            <div className='dz-details'>
                <div className='dz-filename'><span data-dz-name></span></div>
                <img data-dz-thumbnail />
            </div>
            <div className='dz-progress'><span className='dz-upload' data-dz-uploadprogress></span></div>
            <div className='dz-success-mark'><span><Icon name='check'/></span></div>
            <div className='dz-error-mark'><span><Icon name='times'/></span></div>
            <div className='dz-error-message'><span data-dz-errormessage></span></div>
        </div>

    postUrl: ->
        # DANGER: code duplication with class below!
        dest_dir = misc.encode_path(@props.current_path)
        postUrl  = window.app_base_url + "/#{@props.project_id}/raw/.smc/upload?dest_dir=#{dest_dir}"
        return postUrl

    render_close_button: ->
        <div className='close-button pull-right'>
            <span
                onClick   = {@props.close_button_onclick}
                className = 'close-button-x'
                style     = {cursor: 'pointer', fontSize: '18px', color:'gray'}>
                <i className="fa fa-times"></i>
            </span>
        </div>

    render: ->
        <div>
            {@render_close_button() if @props.close_button_onclick?}
            {render_header() if @props.show_header}
            <div style={DROPSTYLE}>
                <DropzoneComponent
                    config        = {postUrl: @postUrl()}
                    eventHandlers = {@props.dropzone_handler}
                    djsConfig     = {previewTemplate: ReactDOMServer.renderToStaticMarkup(@dropzone_template()), maxFilesize:MAX_FILE_SIZE_MB}
                />
            </div>
        </div>

exports.SMC_Dropwrapper = rclass

    displayName: 'dropzone-wrapper'

    propTypes:
        project_id       : rtypes.string.isRequired    # The project to upload files to
        dest_path        : rtypes.string.isRequired    # The path for files to be sent
        config           : rtypes.object               # All supported dropzone.js config options
        event_handlers   : rtypes.object
        preview_template : rtypes.func                 # See http://www.dropzonejs.com/#layout
        show_upload      : rtypes.bool                 # Whether or not to show upload area
        on_close         : rtypes.func
        disabled         : rtypes.bool
        style            : rtypes.object               # css styles to apply to the containing div

    getDefaultProps: ->
        config         : {}
        disabled       : false
        show_upload    : true

    getInitialState: ->
        files : []

    get_djs_config: ->
        # NOTE: Chunking is absolutely critical to get around hard limits in cloudflare!!
        # See https://github.com/sagemathinc/cocalc/issues/3716
        with_defaults = misc.defaults @props.config,
            url                  : @postUrl()
            previewsContainer    : ReactDOM.findDOMNode(@refs.preview_container) ? ""
            previewTemplate      : ReactDOMServer.renderToStaticMarkup(@preview_template())
            maxFilesize          : MAX_FILE_SIZE_MB
            chunking             : true
            chunkSize            : CHUNK_SIZE_MB*1000*1000
            retryChunks          : true  # might as well since it's a little more robust.
            timeout              : 1000*100  # matches what cloudflare imposes on us; this is *per chunk*, so much longer uploads will still work.
        , true
        return misc.merge(with_defaults, @props.config)

    postUrl: ->
        # DANGER: code duplication with class above!
        dest_dir = misc.encode_path(@props.dest_path)
        postUrl  = window.app_base_url + "/#{@props.project_id}/raw/.smc/upload?dest_dir=#{dest_dir}"
        return postUrl

    componentDidMount: ->
        if not @props.disabled
            @_create_dropzone()
            @_set_up_events()

    componentWillUnmount: ->
        if not @dropzone?
            return

        files = @dropzone.getActiveFiles()

        if files.length > 0
            # Stuff is still uploading...
            @queueDestroy = true

            destroyInterval = window.setInterval =>
                if @queueDestroy == false
                    # If the component remounts somehow, don't destroy the dropzone.
                    return window.clearInterval(destroyInterval)

                if @dropzone.getActiveFiles().length == 0
                    @_destroy()
                    return window.clearInterval(destroyInterval)
            , 500
        else
            @_destroy()

    componentDidUpdate: ->
        if not @props.disabled
            @queueDestroy = false
            @_create_dropzone()

    # Update Dropzone options each time the component updates.
    componentWillUpdate: (new_props) ->
        if new_props.disabled
            @_destroy()
        else
            @_create_dropzone()
            if @dropzone?
                # see https://github.com/sagemathinc/cocalc/issues/2072
                @dropzone.options = $.extend(true, {}, @dropzone.options, @get_djs_config())

    preview_template: ->
        if @props.preview_template?
            return @props.preview_template()

        <div className='dz-preview dz-file-preview'>
            <div className='dz-details'>
                <div className='dz-filename'><span data-dz-name></span></div>
                <img data-dz-thumbnail />
            </div>
            <div className='dz-progress'><span className='dz-upload' data-dz-uploadprogress></span></div>
            <div className='dz-success-mark'><span><Icon name='check'/></span></div>
            <div className='dz-error-mark'><span><Icon name='times'/></span></div>
            <div className='dz-error-message'><span data-dz-errormessage></span></div>
        </div>

    close_preview: ->
        @props.on_close?()
        @dropzone?.removeAllFiles()
        @setState(files : [])

    render_preview: ->
        if not @props.show_upload or @state.files.length == 0
            style = display : 'none'
        box_style =
            border       : '2px solid #ccc'
            boxShadow    : '4px 4px 2px #bbb'
            borderRadius : '5px'
            padding      : 0
            margin       : '10px'
            minHeight    : '40px'

        <div style={style}>
            <div className='close-button pull-right'>
                <span
                    onClick   = {@close_preview}
                    className = 'close-button-x'
                    style     = {cursor: 'pointer', fontSize: '18px', color:'gray', marginRight: '20px'}
                >
                    <i className="fa fa-times"></i>
                </span>
            </div>
            {render_header()}
            <div ref      = 'preview_container'
                className = 'filepicker dropzone'
                style     = {box_style}
            />
        </div>

    render: ->
        <div style={@props.style}>
            {@render_preview() if not @props.disabled}
            {@props.children}
        </div>

    _create_dropzone: ->
        if not @dropzone? and not @props.disabled
            dropzone_node = ReactDOM.findDOMNode(@)
            @dropzone = new Dropzone(dropzone_node, @get_djs_config())

    log: (entry) ->
        actions = redux.getProjectActions(@props.project_id)
        actions.log(entry)

    _set_up_events: ->
        return unless @dropzone?

        for name, handlers of @props.event_handlers
            # Check if there's an array of event handlers
            if misc.is_array(handlers)
                for handler in handlers
                    # Check if it's an init handler
                    if handler == 'init'
                        handler(@dropzone)
                    else
                        @dropzone.on(name, handler)
            else
                if name == 'init'
                    handlers(@dropzone)
                else
                    @dropzone.on(name, handlers)

        @dropzone.on 'addedfile', (file) =>
            if file
                files = @state.files
                files.push(file)
                @setState(files : files)
                full_path = os_path.join(@props.dest_path, file.name)
                @log
                    event: "file_action"
                    action: "uploaded"
                    file: full_path

    # Removes ALL listeners and Destroys dropzone.
    # see https://github.com/enyo/dropzone/issues/1175
    _destroy: ->
        if not @dropzone?
            return
        @dropzone.off()
        @dropzone.destroy()
        delete @dropzone
