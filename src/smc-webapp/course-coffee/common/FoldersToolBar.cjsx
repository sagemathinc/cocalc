###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016 -- 2017, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

underscore = require('underscore')
immutable = require('immutable')

# CoCalc libraries
misc = require('smc-util/misc')
{webapp_client} = require('smc-webapp/webapp_client')

# React libraries
{React, rclass, rtypes, ReactDOM}  = require('smc-webapp/app-framework')
{ErrorDisplay, Icon, SearchInput, SkinnyError} = require('smc-webapp/r_misc')
{Button, ButtonToolbar, FormControl, FormGroup, Row, Col} = require('react-bootstrap')

SEARCH_STYLE = marginBottom: '0px'

# Multiple result selector
# use on_change and search to control the search bar
# Coupled with Assignments Panel and Handouts Panel
MultipleAddSearch = rclass
    propTypes :
        add_selected     : rtypes.func.isRequired   # Submit user selected results add_selected(['paths', 'of', 'folders'])
        do_search        : rtypes.func.isRequired   # Submit search query, invoked as do_search(value)
        clear_search     : rtypes.func.isRequired
        is_searching     : rtypes.bool.isRequired   # whether or not it is asking the backend for the result of a search
        search_results   : rtypes.immutable.List    # contents to put in the selection box after getting search result back
        item_name        : rtypes.string

    getDefaultProps: ->
        item_name        : 'result'

    getInitialState: ->
        selected_items : [] # currently selected options
        show_selector  : false

    shouldComponentUpdate: (newProps, newState) ->
        return misc.is_different(@props, newProps, ['search_results', 'item_name', 'is_searching', 'none_found']) or \
            not underscore.isEqual(newState.selected_items, @state.selected_items)

    componentWillReceiveProps: (newProps) ->
        @setState
            show_selector : newProps.search_results? and newProps.search_results.size > 0

    clear_and_focus_search_input: ->
        @props.clear_search()
        @setState(selected_items:[])

    search_button: ->
        if @props.is_searching
            # Currently doing a search, so show a spinner
            <Button>
                <Icon name="cc-icon-cocalc-ring" spin />
            </Button>
        else if @state.show_selector
            # There is something in the selection box -- so only action is to clear the search box.
            <Button onClick={@clear_and_focus_search_input}>
                <Icon name="times-circle" />
            </Button>
        else
            # Waiting for user to start a search
            <Button onClick={(e)=>@refs.search_input.submit(e)}>
                <Icon name="search" />
            </Button>

    add_button_clicked: (e) ->
        e.preventDefault()
        if @state.selected_items.length == 0
            first_entry = ReactDOM.findDOMNode(@refs.selector).firstChild.value
            @props.add_selected([first_entry])
        else
            @props.add_selected(@state.selected_items)
        @clear_and_focus_search_input()

    change_selection: (e) ->
        v = []
        for option in e.target.selectedOptions
            v.push(option.label)
        @setState(selected_items : v)

    render_results_list: ->
        v = []
        @props.search_results.map (item) =>
            v.push(<option key={item} value={item} label={item}>{item}</option>)
        return v

    render_add_selector: ->
        <FormGroup>
            <FormControl componentClass='select' multiple ref="selector" size={5} rows={10} onChange={@change_selection}>
                {@render_results_list()}
            </FormControl>
            <ButtonToolbar>
                {@render_add_selector_button()}
                <Button onClick={@clear_and_focus_search_input}>
                    Cancel
                </Button>
            </ButtonToolbar>
        </FormGroup>

    render_add_selector_button: ->
        num_items_selected = @state.selected_items.length ? 0
        btn_text = switch @props.search_results.size
            when 0 then "No #{@props.item_name} found"
            when 1 then "Add #{@props.item_name}"
            else switch num_items_selected
                when 0, 1 then "Add selected #{@props.item_name}"
                else "Add #{num_items_selected} #{@props.item_name}s"
        <Button disabled={@props.search_results.size == 0} onClick={@add_button_clicked}><Icon name="plus" /> {btn_text}</Button>

    render: ->
        <div>
            <SearchInput
                autoFocus     = {true}
                ref           = 'search_input'
                default_value = ''
                placeholder   = "Add #{@props.item_name} by folder name (enter to see available folders)..."
                on_submit     = {@props.do_search}
                on_clear      = {@clear_and_focus_search_input}
                buttonAfter   = {@search_button()}
                style         = {SEARCH_STYLE}
            />
            {<SkinnyError error_text='No matching folders were found' on_close={@clear_and_focus_search_input}/> if @props.none_found}
            {@render_add_selector() if @state.show_selector}
         </div>


# Filter directories based on contents of all_items
filter_results = (directories, search, all_items) ->
    if directories.length > 0
        # Omit any -collect directory (unless explicitly searched for).
        # Omit any currently assigned directory
        paths_to_omit = []

        active_items = all_items.filter (val) => not val.get('deleted')
        active_items.map (val) =>
            path = val.get('path')
            if path  # path might not be set in case something went wrong (this has been hit in production)
                paths_to_omit.push(path)

        should_omit = (path) =>
            if path.indexOf('-collect') != -1 and search.indexOf('collect') == -1
                # omit assignment collection folders unless explicitly searched (could cause confusion...)
                return true
            return paths_to_omit.includes(path)

        directories = directories.filter (x) => not should_omit(x)
        directories.sort()
    return directories

# Definitely not a good abstraction.
# Purely for code reuse (bad reason..)
# Complects FilterSearchBar and AddSearchBar...
exports.FoldersToolbar = rclass
    propTypes :
        search        : rtypes.string
        search_change : rtypes.func.isRequired      # search_change(current_search_value)
        num_omitted   : rtypes.number
        project_id    : rtypes.string
        items         : rtypes.object.isRequired
        add_folders   : rtypes.func                 # add_folders (Iterable<T>)
        item_name     : rtypes.string
        plural_item_name : rtypes.string

    getDefaultProps: ->
        item_name : "item"
        plural_item_name : "items"

    getInitialState: ->
        add_is_searching   : false
        add_search_results : immutable.List([])
        none_found         : false
        last_add_search    : ''

    do_add_search: (search) ->
        search = search.trim()

        return if @state.add_is_searching and search == @state.last_add_search

        @setState(add_is_searching: true, last_add_search: search)

        webapp_client.find_directories
            project_id : @props.project_id
            query      : "*#{search}*"
            cb         : (err, resp) =>
                # Disregard the results of this search of a new one was already submitted
                return if @state.last_add_search != search

                if err
                    @setState(add_is_searching:false, err:err, add_search_results:undefined)
                    return

                if resp.directories.length == 0
                    @setState(add_is_searching: false, add_search_results: immutable.List([]), none_found: true)
                    return

                @setState (state, props) ->
                    filtered_results = filter_results(resp.directories, search, props.items)

                    # Merge to prevent possible massive list alterations
                    if filtered_results.length == state.add_search_results.size
                        merged = state.add_search_results.merge(filtered_results)
                    else
                        merged = immutable.List(filtered_results)

                    return
                        add_is_searching   : false
                        add_search_results : merged
                        none_found         : false

    submit_selected: (path_list) ->
        if path_list?
            # If nothing is selected and the user clicks the button to "Add handout (etc)" then
            # path_list is undefined, hence don't do this.
            # (NOTE: I'm also going to make it so that button is disabled, which fits our
            # UI guidelines, so there's two reasons that path_list is defined here.)
            @props.add_folders(path_list)
        @clear_add_search()

    clear_add_search: ->
        @setState(add_search_results:immutable.List([]), none_found:false)

    render: ->
        <Row>
            <Col md={3}>
                <SearchInput
                    placeholder   = {"Find #{@props.plural_item_name}..."}
                    default_value = {@props.search}
                    on_change     = {@props.search_change}
                    style         = {SEARCH_STYLE}
                />
            </Col>
            <Col md={4}>
              {<h5>(Omitting {@props.num_omitted} {if @props.num_ommitted > 1 then @props.plural_item_name else @props.item_name})</h5> if @props.num_omitted}
            </Col>
            <Col md={5}>
                <MultipleAddSearch
                    add_selected   = {@submit_selected}
                    do_search      = {@do_add_search}
                    clear_search   = {@clear_add_search}
                    is_searching   = {@state.add_is_searching}
                    item_name      = {@props.item_name}
                    err            = {undefined}
                    search_results = {@state.add_search_results}
                    none_found     = {@state.none_found}
                 />
            </Col>
        </Row>
