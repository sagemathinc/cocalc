###
React component that renders the ordered list of cells
###

immutable = require('immutable')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Loading} = require('../r_misc')

{Cell} = require('./cell')

exports.CellList = rclass ({name}) ->
    propTypes:
        actions   : rtypes.object.isRequired
        cell_list : rtypes.immutable.List.isRequired  # list of ids of cells in order
        font_size : rtypes.number.isRequired

    componentWillUnmount: ->
        # save scroll state
        state = ReactDOM.findDOMNode(@refs.cell_list)?.scrollTop
        if state?
            @props.actions.set_scroll_state(state)

    componentDidMount: ->
        # restore scroll state
        scrollTop = @props.actions.store.get_scroll_state()
        if scrollTop?
            ReactDOM.findDOMNode(@refs.cell_list)?.scrollTop = scrollTop

    render_loading: ->
        <div style={fontSize: '32pt', color: '#888', textAlign: 'center', marginTop: '15px'}>
            <Loading/>
        </div>

    render: ->
        if not @props.cell_list?
            return @render_loading()

        v = []
        @props.cell_list.map (id) =>
            v.push <Cell key={id} name={name} id={id} actions={@props.actions} />
            return
        style =
            fontSize        : "#{@props.font_size}px"
            paddingLeft     : '20px'
            padding         : '20px'
            backgroundColor : '#eee'
            height          : '100%'
            overflowY       : 'auto'

        <div key='cells' style={style} ref='cell_list'>
            <div style={backgroundColor:'#fff', padding:'15px', boxShadow: '0px 0px 12px 1px rgba(87, 87, 87, 0.2)'}>
                {v}
            </div>
        </div>