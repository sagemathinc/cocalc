###
Wrapper in a React component of a non-react editor, so that we can fully rewrite
the UI using React without having to rewrite all the editors.

(c) SageMath, Inc.

AUTHORS:
   - William Stein, 2016
   - John Jeng, 2016
###

{rclass, rtypes, ReactDOM, React} = require('./smc-react')
{defaults, required, copy} = require('smc-util/misc')

WrappedEditor = rclass ({project_name}) ->
    reduxProps :
        "#{project_name}":
            editor_top_position : rtypes.number

    propTypes :
        editor : rtypes.object.isRequired

    componentDidMount: ->
        console.log("componentDidMount")
        window.editor = @props.editor
        span = $(ReactDOM.findDOMNode(@)).find(".smc-editor-react-wrapper")
        if span.length > 0
            span.replaceWith(@props.editor.element[0])
        @props.editor.show()
        window.addEventListener('resize', @refresh)

    componentWillUnmount: ->
        console.log("componentWillUnmount")
        window.removeEventListener('resize', @refresh)

    componentDidUpdate: ->
        console.log("componentDidUpdate")
        @refresh()

    # Refreshes the editor to resize itself
    refresh: ->
        @props.editor._show()

    render : ->
        <div style={flex:'1'}>
            <span className="smc-editor-react-wrapper">Editor goes here</span>
        </div>


# TODO: must do something when editor closes...  right now the editors object just keeps getting bigger.

editors = {}

exports.register_nonreact_editor = (opts) ->
    opts = defaults opts,
        f    : required   # a *function* f(project_id, filename, extra_opts) that returns instance of editor.FileEditor
        ext  : required   # string or list of strings
        icon : undefined

    require('project_file').register_file_editor
        ext       : opts.ext
        icon      : opts.icon
        init      : (path, redux, project_id) ->
            key = "#{project_id}-#{path}"

            if not editors[key]?
                # Overwrite Editor functions called from the various fileEditors
                extra_opts = copy(require('./editor').file_options(path)?.opts ? {})
                e = opts.f(project_id, path, extra_opts)
                editors[key] = e
            console.log("Initializing non-react editor key:", key)
            return key

        generator : (path, redux, project_id) ->
            key = "#{project_id}-#{path}"

            wrapper_generator = ({project_name}) -> <WrappedEditor editor={editors[key]} project_name=project_name />

            wrapper_generator.redux_name = key
            wrapper_generator.get_editor = -> editors[key]

            return wrapper_generator



