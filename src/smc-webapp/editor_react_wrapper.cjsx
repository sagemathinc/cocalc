###
Wrapper in a React component of a non-react editor, so that we can fully rewrite
the UI using React without having to rewrite all the editors.

(c) SageMath, Inc.

AUTHORS:
   - William Stein, 2016
###

{rclass, rtypes, ReactDOM, React} = require('./smc-react')
{defaults, required, copy} = require('smc-util/misc')

WrappedEditor = rclass
    propTypes :
        editor : rtypes.object.isRequired

    componentDidMount: ->
        console.log("componentDidMount")
        window.editor = @props.editor
        span = $(ReactDOM.findDOMNode(@)).find(".smc-editor-react-wrapper")
        if span.length > 0
            span.replaceWith(@props.editor.element[0])
        @props.editor.show()

    componentWillUnmount: ->
        console.log("componentWillUnmount")

    render : ->
        <div>
            <span className="smc-editor-react-wrapper">Editor goes here</span>
        </div>


# TODO: must do something when editor closes...  right now the editors object just keeps getting bigger.

editors = {}

exports.register_nonreact_editor = (opts) ->
    opts = defaults opts,
        f    : required   # a *function* f(editor, filename, extra_opts) that returns instance of editor.FileEditor
        ext  : required   # string or list of strings
        icon : undefined
    require('project_file').register_file_editor
        ext       : opts.ext
        icon      : opts.icon
        init      : () -> console.log("Init non-react editor. Does anything need to go here?")
        generator : (path, redux, project_id) ->
            key = "#{project_id}-#{path}"

            if editors[key]?
                e = editors[key]
            else
                editor = redux.getProjectStore(project_id).get('editor')

                # Overwrite Editor functions called from the various fileEditors
                # HARDCODED MAGIC NUMBER
                editor.editor_top_position = () -> 87 # TODO: change when fullscreen exists again
                extra_opts = copy(editor.file_options(path)?.opts ? {})
                e = opts.f(editor, path, extra_opts)
                editors[key] = e

            wrapper_generator = () -> <WrappedEditor editor={e} />

            wrapper_generator.redux_name = key

            return wrapper_generator



