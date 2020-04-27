
# Wrapper in a React component of a non-react editor, so that we can fully rewrite
# the UI using React without having to rewrite all the editors.

{NotifyResize} = require('./notify-resize/index')

{debounce} = require('underscore')

{rclass, rtypes, ReactDOM, React} = require('./app-framework')
{defaults, required, copy} = require('smc-util/misc')

WrappedEditor = rclass ({project_name}) ->
    displayName: 'NonReactWrapper'

    propTypes :
        editor : rtypes.object.isRequired

    componentDidMount: ->
        # Use for any future Iframe editors...
        #   (Actually, see how editor_pdf and edtor_jupyter done for the right way to do this -- wstein)
        # http://stackoverflow.com/questions/8318264/how-to-move-an-iframe-in-the-dom-without-losing-its-state
        # SMELL: Tasks, Latex and PDF viewer also do this to save scroll position
        # HACK: I have no idea why setTimeout is necessary. 2017/12/23
        # Removing it results in a bug when switching from modern Jupyter to Classic Jupyter where
        # a Loading span (WITHOUT a spinner and not the Classic Jupyter Loading alert) displays and the
        # dom element never updates until going to a new tab and returning.
        # Waiting here until the end of the stack fixes this.
        # Could not replicate in Chrome step through debugger.

        @_mounted = true
        window.setTimeout =>
            if not @_mounted  # this can, of course, happen!
                return
            span = $(ReactDOM.findDOMNode(@)).find(".smc-editor-react-wrapper")
            if span.length > 0
                span.replaceWith(@props.editor.element[0])
        , 0

        @props.editor.show()
        @props.editor.focus?()
        @props.editor.restore_view_state?()
        window.addEventListener('resize', @refresh)

    componentDidUpdate: ->
        @refresh()

    componentWillUnmount: ->
        @_mounted = false
        window.removeEventListener('resize', @refresh)
        # These cover all cases for jQuery type overrides.
        @props.editor.save_view_state?()
        @props.editor.blur?()
        @props.editor.hide()

    # Refreshes -- cause the editor to resize itself
    refresh: ->
        if not @props.editor.show?
            @props.editor._show?()
        else
            @props.editor.show()

    render: ->
        # position relative is required by NotifyResize
        <div className='smc-vfill' style={position:'relative'}>
            <NotifyResize onResize={debounce(@refresh, 350)}/>
            <span className="smc-editor-react-wrapper"></span>
        </div>

# Used for caching
editors = {}

get_key = (project_id, path) ->
    return "#{project_id}-#{path}"

exports.get_editor = (project_id, path) ->
    return editors[get_key(project_id, path)]

exports.register_nonreact_editor = (opts) ->
    opts = defaults opts,
        f         : required   # a *function* f(project_id, filename, extra_opts) that returns instance of editor.FileEditor
        ext       : required   # string or list of strings
        icon      : undefined
        is_public : false

    if window?.smc?
        # make it much clearer which extensions use non-react editors
        window.smc.nonreact ?= []
        window.smc.nonreact.push({ext:opts.ext, is_public:opts.is_public})

    require('project_file').register_file_editor
        ext       : opts.ext
        is_public : opts.is_public
        icon      : opts.icon
        init      : (path, redux, project_id) ->
            key = get_key(project_id, path)

            if not editors[key]?
                # Overwrite functions called from the various file editors
                extra_opts = copy(require('./editor').file_options(path)?.opts ? {})
                e = opts.f(project_id, path, extra_opts)
                editors[key] = e
            return key

        generator : (path, redux, project_id) ->
            key = get_key(project_id, path)
            wrapper_generator = ({project_name}) ->
                if editors[key]?
                    return <WrappedEditor editor={editors[key]} project_name={project_name} />
                else
                    # GitHub #4231 and #4232 -- sometimes the editor gets rendered
                    # after it gets removed.  Presumably this is just for a moment, but
                    # it's good to do something halfway sensible rather than hit a traceback in
                    # this case...
                    return <div>Please close then re-open this file.</div>
            wrapper_generator.get_editor = -> editors[key]
            return wrapper_generator

        remove    : (path, redux, project_id) ->
            key = get_key(project_id, path)
            if editors[key]
                editors[key].remove()
                delete editors[key]

        save     : (path, redux, project_id) ->
            if opts.is_public
                return
            editors[get_key(project_id, path)]?.save?()


if DEBUG
    smc.editors = editors
