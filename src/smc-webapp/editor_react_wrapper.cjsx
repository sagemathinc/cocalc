##############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
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
##############################################################################
# Wrapper in a React component of a non-react editor, so that we can fully rewrite
# the UI using React without having to rewrite all the editors.
##############################################################################

{NotifyResize} = require('react-notify-resize')

{debounce} = require('underscore')

{rclass, rtypes, ReactDOM, React} = require('./smc-react')
{defaults, required, copy} = require('smc-util/misc')

WrappedEditor = rclass ({project_name}) ->
    propTypes :
        editor : rtypes.object.isRequired

    componentDidMount: ->
        # Use for any future Iframe editors...
        #   (Actually, see how editor_pdf and edtor_jupyter done for the right way to do this -- wstein)
        # http://stackoverflow.com/questions/8318264/how-to-move-an-iframe-in-the-dom-without-losing-its-state
        # SMELL: Tasks, Latex and PDF viewer also do this to save scroll position
        span = $(ReactDOM.findDOMNode(@)).find(".smc-editor-react-wrapper")
        if span.length > 0
            span.replaceWith(@props.editor.element[0])

        @props.editor.show()
        @props.editor.focus?()
        window.addEventListener('resize', @refresh)

    componentDidUpdate: ->
        @refresh()

    componentWillUnmount: ->
        window.removeEventListener('resize', @refresh)
        # These cover all cases for jquery type overrides.
        @props.editor.blur?()
        @props.editor.hide()

    # Refreshes the editor to resize itself
    refresh: ->
        if not @props.editor.show?
            @props.editor._show()
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
            wrapper_generator = ({project_name}) -> <WrappedEditor editor={editors[key]} project_name=project_name />
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
            e = editors[get_key(project_id, path)]
            # click_save_button if defined, otherwise just the save function.
            if e?
                (e.click_save_button ? e.save)?()


if DEBUG
    smc.editors = editors
