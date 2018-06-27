###
React component that renders the ordered list of cells
###

immutable                         = require('immutable')
{React, ReactDOM, rclass, rtypes} = require('../app-framework')
{Loading}                         = require('../r_misc')
{Cell}                            = require('./cell')
{InsertCell}                      = require('./insert-cell')
keyboard                          = require('./keyboard')

PADDING = 100

exports.CellList = rclass
    propTypes:
        actions      : rtypes.object   # if not defined, then everything read only
        cell_list    : rtypes.immutable.List.isRequired  # list of ids of cells in order
        cells        : rtypes.immutable.Map.isRequired
        font_size    : rtypes.number.isRequired
        sel_ids      : rtypes.immutable.Set            # set of selected cells
        md_edit_ids  : rtypes.immutable.Set
        cur_id       : rtypes.string               # cell with the green cursor around it; i.e., the cursor cell
        mode         : rtypes.string.isRequired
        cm_options   : rtypes.immutable.Map.isRequired
        project_id   : rtypes.string
        directory    : rtypes.string
        scrollTop    : rtypes.number
        complete     : rtypes.immutable.Map            # status of tab completion
        is_focused   : rtypes.bool
        more_output  : rtypes.immutable.Map
        scroll       : rtypes.oneOfType([rtypes.number, rtypes.string])
        cell_toolbar : rtypes.string
        trust        : rtypes.bool

    componentWillUnmount: ->
        # save scroll state
        state = ReactDOM.findDOMNode(@refs.cell_list)?.scrollTop
        if state? and @props.actions?
            @props.actions.set_scroll_state(state)

        if @props.actions?
            # handle focus via an event handler on window.
            # We have to do this since, e.g., codemirror editors
            # involve spans that aren't even children, etc...
            $(window).unbind('click', @window_click)
            @props.actions.disable_key_handler()

    componentDidMount: ->

        if @props.scrollTop?
            # restore scroll state -- as rendering happens dynamically and asynchronously, and I have no idea how to know
            # when we are done, we can't just do this once.  Instead, we keep resetting scrollTop until scrollHeight
            # stops changing or 2s elapses.
            locals =
                scrollTop    : @props.scrollTop
                scrollHeight : 0
            f = =>
                elt = ReactDOM.findDOMNode(@refs?.cell_list)
                if elt? and elt.scrollHeight != locals.scrollHeight  # dynamically rendering actually changed something
                    elt.scrollTop = locals.scrollTop
                    locals.scrollHeight = elt.scrollHeight
            for tm in [0, 250, 750, 1500, 2000]
                setTimeout(f, tm)

        if @props.actions?
            # Enable keyboard handler if necessary
            if @props.is_focused
                @props.actions.enable_key_handler()
            # Also since just mounted, set this to be focused.
            # When we have multiple editors on the same page, we will
            # have to set the focus at a higher level (in the project store?).
            @props.actions.focus(true)
            # setup a click handler so we can manage focus
            $(window).on('click', @window_click)

        @props.actions?._cell_list_div = $(ReactDOM.findDOMNode(@refs.cell_list))

    window_click: (event) ->
        if $(".in.modal").length
            # A bootstrap modal is currently opened, e.g., support page, etc.
            # so do not focus no matter what -- in fact, blur for sure.
            @props.actions.blur()
            return
        # if click in the cell list, focus the cell list; otherwise, blur it.
        elt = $(ReactDOM.findDOMNode(@))
        offset = elt.offset()
        x = event.pageX - offset.left
        y = event.pageY - offset.top
        if x >= 0 and y >=0 and x <= elt.outerWidth() and y <= elt.outerHeight()
            @props.actions.focus()
        else
            @props.actions.blur()
        return

    componentWillReceiveProps: (next) ->
        if @props.actions? and next.is_focused != @props.is_focused
            # the focus state changed.
            if next.is_focused
                @props.actions.enable_key_handler()
            else
                @props.actions.disable_key_handler()
        if next.scroll?
            @scroll_cell_list(next.scroll)
            @props.actions.scroll()  # reset scroll request state

    scroll_cell_list: (scroll) ->
        elt = $(ReactDOM.findDOMNode(@refs.cell_list))
        if elt.length > 0
            if typeof(scroll) == 'number'
                elt.scrollTop(elt.scrollTop() + scroll)
                return

            # supported scroll positions are in commands.coffee
            if scroll == 'cell visible'
                # ensure selected cell is visible
                cur = elt.find("##{@props.cur_id}")
                if cur.length > 0
                    top = cur.position().top - elt.position().top
                    if top < PADDING
                        scroll = 'cell top'
                    else if top > elt.height() - PADDING
                        scroll = 'cell bottom'
                    else
                        return
            switch scroll
                when 'list up'
                    # move scroll position of list up one page
                    elt.scrollTop(elt.scrollTop() - elt.height()*.9)
                when 'list down'
                    # move scroll position of list up one page
                    elt.scrollTop(elt.scrollTop() + elt.height()*.9)
                when 'cell top'
                    cur = elt.find("##{@props.cur_id}")
                    if cur.length > 0
                        elt.scrollTop(elt.scrollTop() +  (cur.position().top - elt.position().top) - PADDING)
                when 'cell center'
                    cur = elt.find("##{@props.cur_id}")
                    if cur.length > 0
                        elt.scrollTop(elt.scrollTop() +  (cur.position().top - elt.position().top) - elt.height()*.5)
                when 'cell bottom'
                    cur = elt.find("##{@props.cur_id}")
                    if cur.length > 0
                        elt.scrollTop(elt.scrollTop() +  (cur.position().top - elt.position().top) - elt.height()*.9 + PADDING)


    render_loading: ->
        <div style={fontSize: '32pt', color: '#888', textAlign: 'center', marginTop: '15px'}>
            <Loading/>
        </div>

    on_click: (e) ->
        @props.actions.clear_complete()
        if $(e.target).hasClass('cocalc-complete')
            # Bootstrap simulates a click even when user presses escape; can't catch there.
            # See the complete component in codemirror-static.
            @props.actions.set_mode('edit')

    render_insert_cell: (id, position='above') ->
        <InsertCell
            id       = {id}
            key      = {id+'insert'+position}
            position = {position}
            actions  = {@props.actions}
        />

    render: ->
        if not @props.cell_list?
            return @render_loading()

        v = []
        @props.cell_list.map (id) =>
            cell_data  = @props.cells.get(id)
            # is it possible/better idea to use the @actions.store here?
            editable   = cell_data.getIn(['metadata', 'editable']) ? true
            deletable  = cell_data.getIn(['metadata', 'deletable']) ? true
            cell = <Cell
                    key              = {id}
                    actions          = {@props.actions}
                    id               = {id}
                    cm_options       = {@props.cm_options}
                    cell             = {cell_data}
                    is_current       = {id == @props.cur_id}
                    is_selected      = {@props.sel_ids?.contains(id)}
                    is_markdown_edit = {@props.md_edit_ids?.contains(id)}
                    mode             = {@props.mode}
                    font_size        = {@props.font_size}
                    project_id       = {@props.project_id}
                    directory        = {@props.directory}
                    complete         = {@props.complete}
                    is_focused       = {@props.is_focused}
                    more_output      = {@props.more_output?.get(id)}
                    cell_toolbar     = {@props.cell_toolbar}
                    trust            = {@props.trust}
                    editable         = {editable}
                    deletable        = {deletable}
                    />
            if @props.actions?
                v.push(@render_insert_cell(id))
            v.push(cell)
            return
        if @props.actions? and v.length > 0
            id = @props.cell_list.get(@props.cell_list.size-1)
            v.push(@render_insert_cell(id, 'below'))

        style =
            fontSize        : "#{@props.font_size}px"
            paddingLeft     : '20px'
            padding         : '20px'
            backgroundColor : '#eee'
            height          : '100%'
            overflowY       : 'auto'
            overflowX       : 'hidden'

        cells_style =
            backgroundColor : '#fff'
            padding         : '15px'
            boxShadow       : '0px 0px 12px 1px rgba(87, 87, 87, 0.2)'

        <div key='cells' style={style} ref='cell_list' onClick={@on_click if @props.actions? and @props.complete?}>
            <div style={cells_style}>
                {v}
            </div>
            <div style={minHeight: '100px'}>
            </div>
        </div>