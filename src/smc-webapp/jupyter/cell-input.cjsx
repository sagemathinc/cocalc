###
React component that describes the input of a cell
###
immutable = require('immutable')

misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')
{Markdown} = require('../r_misc')

{CodeMirror} = require('./codemirror')

{InputPrompt} = require('./prompt')

{Complete} = require('./complete')

{CellToolbar} = require('./cell-toolbar')

{CellTiming} = require('./cell-output-time')

{get_blob_url} = require('./server-urls')

href_transform = (project_id, cell) ->
    (href) ->
        if not misc.startswith(href, 'attachment:')
            return href
        name = href.slice('attachment:'.length)
        data = cell.getIn(['attachments', name])
        ext  = misc.filename_extension(name)
        switch data?.get('type')
            when 'sha1'
                sha1 = data.get('value')
                return get_blob_url(project_id, ext, sha1)
            when 'base64'
                if ext == 'jpg'
                    ext = 'jpeg'
                return "data:image/#{ext};base64,#{data.get('value')}"
            else
                return ''

markdown_post_hook = (elt) ->
    elt.find(':header').each (_, h) ->
        h    = $(h)
        hash = h.text().trim().replace(/\s/g,'-')
        h.attr('id', hash).addClass('cocalc-jupyter-header')
        h.append($('<a/>').addClass('cocalc-jupyter-anchor-link').attr('href', '#' + hash).text('¶'))
        return

exports.CellInput = rclass
    displayName : 'CellInput'

    propTypes:
        actions          : rtypes.object   # not defined = read only
        cm_options       : rtypes.immutable.Map.isRequired
        cell             : rtypes.immutable.Map.isRequired
        is_markdown_edit : rtypes.bool
        is_focused       : rtypes.bool
        is_current       : rtypes.bool
        font_size        : rtypes.number  # Not actually used, but it is CRITICAL that we re-render when this changes!
        project_id       : rtypes.string
        directory        : rtypes.string
        complete         : rtypes.immutable.Map              # status of tab completion
        cell_toolbar     : rtypes.string
        trust            : rtypes.bool
        is_readonly      : rtypes.bool

    shouldComponentUpdate: (next) ->
        return \
            next.cell.get('input')        != @props.cell.get('input') or \
            next.cell.get('exec_count')   != @props.cell.get('exec_count') or \
            next.cell.get('cell_type')    != @props.cell.get('cell_type') or \
            next.cell.get('state')        != @props.cell.get('state') or \
            next.cell.get('start')        != @props.cell.get('start') or \
            next.cell.get('end')          != @props.cell.get('end') or \
            next.cell.get('tags')         != @props.cell.get('tags') or \
            next.cell.get('cursors')      != @props.cell.get('cursors') or \
            next.cell.get('line_numbers') != @props.cell.get('line_numbers') or \
            next.cm_options               != @props.cm_options or \
            next.trust                    != @props.trust or \
            (next.is_markdown_edit        != @props.is_markdown_edit and next.cell.get('cell_type') == 'markdown') or \
            next.is_focused               != @props.is_focused or \
            next.is_current               != @props.is_current or \
            next.font_size                != @props.font_size or \
            next.complete                 != @props.complete or\
            next.cell_toolbar             != @props.cell_toolbar or \
            (next.cell_toolbar == 'slideshow' and (next.cell.get('slide') != @props.cell.get('slide')))

    render_input_prompt: (type) ->
        <InputPrompt
            type       = {type}
            state      = {@props.cell.get('state')}
            exec_count = {@props.cell.get('exec_count')}
            kernel     = {@props.cell.get('kernel')}
            start      = {@props.cell.get('start')}
            end        = {@props.cell.get('end')}
        />

    handle_md_double_click: ->
        return if not @props.actions?
        return if @props.cell.getIn(['metadata', 'editable']) == false
        id = @props.cell.get('id')
        @props.actions.set_md_cell_editing(id)
        @props.actions.set_cur_id(id)
        @props.actions.set_mode('edit')

    options: (type) ->
        switch type
            when 'code'
                options = @props.cm_options.get('options')
            when 'markdown'
                options = @props.cm_options.get('markdown')
            else  # raw
                options = @props.cm_options.get('options')
                options = options.set('mode',{})
                options = options.set('foldGutter', false)  # no use with no mode
        if @props.is_readonly
            options = options.set('readOnly', 'nocursor')
        if @props.cell.get('line_numbers')?
            options = options.set('lineNumbers', @props.cell.get('line_numbers'))
        return options

    render_codemirror: (type) ->
        <CodeMirror
            value         = {@props.cell.get('input') ? ''}
            options       = {@options(type)}
            actions       = {@props.actions}
            id            = {@props.cell.get('id')}
            is_focused    = {@props.is_focused}
            font_size     = {@props.font_size}
            cursors       = {@props.cell.get('cursors')}
        />


    render_markdown: ->
        value = @props.cell.get('input')?.trim()
        if not value
            if not @props.actions?
                value = ''  # read only (no actions so can't do anything), so no need for instructions about how to edit.
            else
                value = 'Type *Markdown* and LaTeX: $\\alpha^2$'
        <div
            onDoubleClick = {@handle_md_double_click}
            style         = {width:'100%', wordWrap: 'break-word', overflow: 'auto'}
            className     = 'cocalc-jupyter-rendered cocalc-jupyter-rendered-md'
            >
            <Markdown
                value          = {value}
                project_id     = {@props.project_id}
                file_path      = {@props.directory}
                href_transform = {href_transform(@props.project_id, @props.cell)}
                post_hook      = {markdown_post_hook}
                safeHTML       = {not @props.trust}
            />
        </div>

    render_unsupported: (type) ->
        <div>
            Unsupported cell type {type}
        </div>

    render_input_value: (type) ->
        id = @props.cell.get('id')
        switch type
            when 'code'
                @render_codemirror(type)
            when 'raw'
                @render_codemirror(type)
            when 'markdown'
                if @props.is_markdown_edit
                    @render_codemirror(type)
                else
                    @render_markdown()
            else
                @render_unsupported(type)

    render_complete: ->
        if @props.complete?
            if @props.complete.get('matches')?.size > 0
                <Complete
                    complete = {@props.complete}
                    actions  = {@props.actions}
                    id       = {@props.id}
                />

    render_cell_toolbar: ->
        if not @props.cell_toolbar or not @props.actions?
            return
        <CellToolbar
            actions      = {@props.actions}
            cell_toolbar = {@props.cell_toolbar}
            cell         = {@props.cell}
        />


    render_time: ->
        cell = @props.cell
        if cell.get('start')?
            <div style={position:'absolute', zIndex: 1, right: '2px', width: '100%', paddingLeft:'5px'} className='pull-right hidden-xs'>
                <div style={color:'#999', fontSize:'8pt', position:'absolute', right:'5px', lineHeight: 1.25, top: '1px', textAlign:'right'}>
                    <CellTiming
                        start = {cell.get('start')}
                        end   = {cell.get('end')}
                        state = {cell.get('state')}
                     />
                </div>
            </div>

    render: ->
        type = @props.cell.get('cell_type') ? 'code'
        <div>
            {@render_cell_toolbar()}
            <div style={display: 'flex', flexDirection: 'row', alignItems: 'stretch'}>
                {@render_input_prompt(type)}
                {@render_complete()}
                {@render_input_value(type)}
                {@render_time()}
            </div>
        </div>

