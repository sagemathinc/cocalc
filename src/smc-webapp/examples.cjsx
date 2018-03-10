##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2015 -- 2018, SageMath, Inc.
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
###############################################################################

# Examples Dialog
# This is a modal dialog, which downloads a hierarchical collection of code snippets
# with descriptions. It returns an object, containing the code and the language:
# {"code": "...", "lang" : "..."} via a given callback.
#
# The canonical project creating the appropriate datastructure is
# https://github.com/sagemathinc/cocalc-assistant

REPO_URL = 'https://github.com/sagemathinc/cocalc-assistant'

# Usage:
# w = render_examples_dialog(target, project_id, filename, lang)
#     * target: jquery dom object, where react is put into
#     * project_id and filename to make state in redux unique
#     * lang is the mode (sage, r, python, ...)
# use 'w.set_handler' to set the handler that's used for inserting the selected document
# API (implemented in ExamplesActions)
# w.show([lang]) -- show dialog again (same state!) and in csae a language given, a selection of it is triggered

# global libs
_         = require('underscore')
immutable = require('immutable')
# react elements
{React, ReactDOM, redux, Redux, Actions, Store, rtypes, rclass} = require('./smc-react')
{Col, Row, Panel, Button, FormGroup, Checkbox, FormControl, Well, Alert, Modal, Table, Nav, NavItem, ListGroup, ListGroupItem, InputGroup} = require('react-bootstrap')
{Loading, Icon, Markdown, Space} = require('./r_misc')
# cocalc libs
{defaults, required, optional} = misc = require('smc-util/misc')

# used elsewhere, to make sure we use the same iconography everywhere
exports.ICON_NAME = 'magic'

# the json from the server, where the entries for the documents are
# double-nested objects (two hiearchies of categories) mapping to title/code/description documents
DATA = null

redux_name = (project_id, path) ->
    return "examples-#{project_id}-#{path}"

# convert a language like "python" or "r" (usually short and lowercase) to a canonical name
# TODO this should probably be part of the "data", or a more global function somewhere in the webapp.
lang2name = (lang) ->
    if lang == 'python'
        return 'Python'
    else if lang == 'gap'
        return 'GAP'
    else if lang == 'sage' or misc.startswith(lang, 'sage-')
        return 'SageMath'
    else
        return lang.charAt(0).toUpperCase() + lang[1..]

# Redux stuff

INIT_STATE =
    cat0                : null # idx integer
    cat1                : null # idx integer
    cat2                : null # idx integer
    catlist0            : []
    catlist1            : []
    catlist2            : []
    code                : ''
    setup_code          : undefined
    descr               : ''
    hits                : []
    search_str          : null
    search_sel          : null
    submittable         : false
    cat1_top            : ["Introduction", "Tutorial", "Help"]
    unknown_lang        : false

makeExamplesStore = (NAME) ->
    name: NAME

    stateTypes:
        cat0                : rtypes.number      # index of selected first category (left)
        cat1                : rtypes.number      # index of selected second category (second from left)
        cat2                : rtypes.number      # index of selected third category (document titles)
        catlist0            : rtypes.arrayOf(rtypes.string)  # list of first category entries
        catlist1            : rtypes.arrayOf(rtypes.string)  # list of second level categories
        catlist2            : rtypes.arrayOf(rtypes.string)  # third level are the document titles
        code                : rtypes.string      # displayed content of selected document
        setup_code          : rtypes.string      # optional, common code in the sub-category
        prepend_setup_code  : rtypes.bool        # if true, setup code is prepended to code
        descr               : rtypes.string      # markdown-formatted content of document description
        hits                : rtypes.arrayOf(rtypes.array)  # search results
        search_str          : rtypes.string      # substring to search for -- or undefined
        search_sel          : rtypes.number      # index of selected matched documents
        submittable         : rtypes.bool        # if true, the buttons at the bottom are active
        cat1_top            : rtypes.arrayOf(rtypes.string)
        unknown_lang        : rtypes.bool        # true if there is no known set of documents for the language

    getInitialState: ->
        INIT_STATE

    data_lang: ->
        @get('data').get(@get('lang'))

    # First categories list, depends on selected language, sort order depends on cat1_top
    get_catlist0: () ->
        cat0 = @data_lang().keySeq().toArray()
        top = @get('cat1_top')
        cat0ordering = (el) ->
            i = - top.reverse().indexOf(el)
            return [i, el]
        return _.sortBy(cat0, cat0ordering)

    # Second level categories list, depends on selected index of first level
    # Sorted by cat1_top and a possible 'sortweight'
    get_catlist1: () ->
        k0 = @get_catlist0()[@get('cat0')]
        cat1data = @data_lang().get(k0)
        cat1 = cat1data.keySeq().toArray()
        top = @get('cat1_top')
        cat1ordering = (el) ->
            so = cat1data?.getIn([el, 'sortweight']) ? 0.0
            i = - top.reverse().indexOf(el)
            return [so, i, el]
        return _.sortBy(cat1, cat1ordering)

    # The titles of the selected documents are exactly as they're in the original data (they're an array)
    # That way, it's possible to create a coherent narrative from top to bottom
    get_catlist2: () ->
        k0 = @get_catlist0()[@get('cat0')]
        k1 = @get_catlist1()[@get('cat1')]
        return @data_lang().getIn([k0, k1, 'entries']).map((el) -> el.get(0)).toArray()


class ExamplesActions extends Actions
    _init: (store) ->
        @store = store

    get: (key) ->
        @store.get(key)

    set: (update) ->
        @setState(update)

    show: (lang) =>
        lang ?= 'sage'
        if lang != @get('lang')
            @init(lang)
        else
            @set(show: true)

    reset: ->
        @set(INIT_STATE)

    hide: =>
        @set(show: false)

    init: (lang) ->
        return if not lang?
        if not @get('initialized')
            @reset()
            @set(lang:lang)
            @load_data()
        else if @get('lang') != lang
            @select_lang(lang)
        @set
            show                : true
            initialized         : true
            prepend_setup_code  : @get('prepend_setup_code') ? true

    init_data: (data) ->
        @set(data: data)
        nav_entries = []
        for key, v of data
            if _.keys(v).length > 0
                nav_entries.push(key)
        @set(nav_entries: nav_entries)
        @select_lang(@get('lang'))

    set_handler: (handler) ->
        @set(handler:handler)

    insert: (descr) ->
        # this is the essential task of the example dialog:
        # call the callback with the selected code snippet
        code               = @get('code')
        setup_code         = @get('setup_code')
        prepend_setup_code = @get('prepend_setup_code')
        if (prepend_setup_code) and (setup_code?.length > 0)
            code = "#{setup_code}\n#{code}"
        ret =
            code  : code
            lang  : @get('lang')
            descr : if descr then @get('descr') else null
        @get('handler')?(ret)

    load_data: () ->
        if not DATA?
            require.ensure [], =>
                # DATA is a global variable!
                # this file is supposed to be in webapp-lib/examples/examples.json
                # follow "./install.py examples" to see how the makefile is called during build
                DATA = require('webapp-lib/examples/examples.json')
                @init_data(DATA)
        else
            @init_data(DATA)

    # when a language is selected, this resets the category selections
    select_lang: (lang) ->
        return if lang? == @get('lang')
        lang ?= @get('lang')
        @reset()
        data = @get('data')
        if data.has(lang)
            @set(lang: lang)
            catlist0 = @store.get_catlist0()
            @set(catlist0 : catlist0)
            if catlist0.length == 1
                @set_selected_category(0, 0)
        else
            @set(unknown_lang:true)

    # a search is performed. basically looks through the documents until it finds enough results ...
    search: (search_str) ->
        @reset()
        if not search_str? or search_str.length == 0
            @select_lang(@get('lang'))
            return
        @set(search_str : search_str)
        str = search_str.toLowerCase()
        hits = []
        data_lang = @store.data_lang()
        EnoughResultsException = {}
        try
            data_lang.forEach (data1, lvl1) ->
                data1.forEach (data2, lvl2) ->
                    data2.get('entries').forEach (doc, lvl3) ->
                        title = doc.get(0)
                        descr = doc.getIn([1, 1])
                        inTitle = title.toLowerCase().indexOf(str)
                        inDescr = descr.toLowerCase().indexOf(str)
                        if inTitle != -1 or inDescr != -1
                            hits.push([lvl1, lvl2, lvl3, title, descr, inDescr])
                            if hits.length >= 30
                                throw EnoughResultsException
        catch ex
            if ex isnt EnoughResultsException
                throw ex
        @set(hits: hits)

    # a specific search result is selected and the corresponding document is set to be shown to the user
    search_selected: (idx) ->
        [lvl1, lvl2, lvl3, title, descr, inDescr] = @get('hits').get(idx).toArray()
        doc = @store.data_lang().getIn([lvl1, lvl2, 'entries', lvl3])
        @show_doc(doc)
        @set(search_sel : idx)

    # keyboard handling for the search list
    search_cursor: (dir) ->
        # searching and then cursor-selecting search results
        # dir: +1 → downward / -1 → upward
        return if not @get('hits')?
        l = @get('hits').size
        if not @get('search_sel')?
            if dir > 0
                new_sel = 0
            else
                new_sel = l - 1
        else
            l = @get('hits').size
            new_sel = (@get('search_sel') + dir) % l
            if new_sel < 0
                new_sel = l - 1
        @set(search_sel : new_sel)
        @search_selected(new_sel)

    # for a specific document, set the code and description box values.
    show_doc: (doc) ->
        @set
            code        : doc.getIn([1, 0])
            descr       : doc.getIn([1, 1])
            submittable : true

    # key handling for the categories selection.
    # there is also a "twist": it wraps around at the end of a category to the next higher category
    # (similar to a counter with carry) but the lenght of the categories changes!
    select_cursor: (dir) ->
        # dir: only 1 or -1!
        # +1 → downward, higher idx number, first in list
        # -1 → upwards, lower index, last in list
        cat0 = @get('cat0')
        cat1 = @get('cat1')
        cat2 = @get('cat2')
        # console.log 'cat0', cat0, 'cat1', cat1, 'cat2', cat2
        top_or_bottom = (list) ->
            if dir < 0 then list.length - 1 else 0
        # dealing with some corner cases first
        if not cat0?
            catlist0 = @store.get_catlist0()
            if catlist0?.length > 0
                @set_selected_category(0, top_or_bottom(catlist0))
        else if not cat1?
            catlist1 = @store.get_catlist1()
            if catlist1?.length > 0
                @set_selected_category(1, top_or_bottom(catlist1))
        else if not cat2?
            catlist2 = @store.get_catlist2()
            if catlist2?.length > 0
                @set_selected_category(2, top_or_bottom(catlist2))
        else # cat0 1 and 2 are defined (i.e. we have a selection)
            l0 = @get('catlist0').size
            l1 = @get('catlist1').size
            l2 = @get('catlist2').size
            cat2_next = cat2 + dir

            # the next two blocks take care of carry in cat 2 and 1
            # trick: to accomodate for lists of varying length, an index
            # of -1 is fine -- see @set_selected_category
            if cat2_next < 0
                cat1_next = cat1 - 1
            else if cat2_next >= l2
                cat2_next = 0
                cat1_next = cat1 + 1

            if cat1_next < 0
                cat0_next = cat0 - 1
            else if cat1_next >= l1
                cat1_next = 0
                cat0_next = cat0 + 1

            if cat0_next?
                # wrap cat0 around (no curry)
                cat0_next = (cat0_next) % l0
                if cat0_next < 0
                    cat0_next = l0 - 1
                @set_selected_category(0, cat0_next)
            if cat1_next?
                @set_selected_category(1, cat1_next)
            @set_selected_category(2, cat2_next)

    # this sets a selected category for a given level.
    # it is able to handle negative indices (wraps around nicely) and it also expands
    # subcategories, if there is only one choice.
    set_selected_category: (level, idx) ->
        lang = @store.data_lang()
        switch level
            when 0, 1
                @set
                    code        : ''
                    descr       : ''
                    cat2        : null
                    submittable : false
                    setup_code  : ''

        switch level
            when 0
                @set(cat0: if idx == -1 then @get('catlist0').size - 1 else idx)
                catlist1 = @store.get_catlist1()
                @set
                    cat1       : null
                    cat2       : null
                    catlist1   : catlist1
                    catlist2   : []
                if catlist1.length == 1
                    @set_selected_category(1, 0)

            when 1
                cat0     = @get('cat0')
                @set(cat1 : if idx == -1 then @get('catlist1').size - 1 else idx)
                catlist2 = @store.get_catlist2()
                @set
                    cat2       : undefined
                    catlist2   : catlist2
                if catlist2.length == 1
                    @set_selected_category(2, 0)

            when 2
                k0    = @get('catlist0').get(@get('cat0'))
                k1    = @get('catlist1').get(@get('cat1'))
                idx   = if idx == -1 then @get('catlist2').size - 1 else idx
                doc   = lang.getIn([k0, k1, 'entries', idx])
                setup = lang.getIn([k0, k1, 'setup'])
                @set(cat2:idx, setup_code:setup)
                @show_doc(doc)

# The top part of the dialog. Shows the Title (maybe with the Language), a selector for the language, and search
outer_style =
    display        : 'flex'
    flexWrap       : 'nowrap'
    justifyContent : 'space-between'

inner_style = immutable.Map
    marginLeft  : '10px'
    marginRight : '10px'

title_style  = inner_style.merge({flex: '0 0 auto'}).toJS()
nav_style    = inner_style.merge({flex: '1 0 auto'}).toJS()
search_style = inner_style.merge({flex: '0 1 auto', marginRight: '50px'}).toJS()

ExamplesHeader = rclass
    displayName : 'ExamplesHeader'

    propTypes:
        actions      : rtypes.object
        nav_entries  : rtypes.arrayOf(rtypes.string)
        search_str   : rtypes.string
        lang         : rtypes.string
        lang_select  : rtypes.bool
        unknown_lang : rtypes.bool

    getDefaultProps: ->
        search_str : ''

    shouldComponentUpdate: (props, state) ->
        ret = misc.is_different(@props, props, [
            'lang', 'search_str', 'search_sel', 'unknown_lang'
        ])
        ret or= misc.is_different_array(props.nav_entries, @props.nav_entries)
        return ret

    langSelect: (key) ->
        @props.actions.select_lang(key)

    search: (evt) ->
        evt.preventDefault()
        evt.stopPropagation()
        @props.actions.search(evt.target.value)

    handle_search_keyup: (evt) ->
        if not @props.search_str?.length
            return true
        switch evt.keyCode
            when 27 # ESC
                if @props.search_str?.length > 0
                    @props.actions.search('')
                else
                    return true
            when 38
                @props.actions.search_cursor(-1)
            when 40
                @props.actions.search_cursor(+1)
            else
                # let them propagate up to the dialog's key handler
                return true
        evt.preventDefault() # which
        evt.stopPropagation() # does
        evt.nativeEvent.stopImmediatePropagation() # what ?!
        return false

    search_clear: ->
        @props.actions.search('')

    # a horizontal list of clickable language categories
    render_nav: ->
        entries = @props.nav_entries ? []
        <Nav
            bsStyle   = {'pills'}
            style     = {marginLeft:'10px'}
            activeKey = {@props.lang}
            ref       = {'lang'}
            onSelect  = {@langSelect}
        >
            {
                entries.map (key, idx) ->
                    name = lang2name(key)
                    <NavItem
                        key      = {idx}
                        eventKey = {key}
                        title    = {name}
                    >
                        {name}
                    </NavItem>
            }
        </Nav>

    render_search: ->
        bsStyle = if @props.search_str?.length > 0 then 'warning' else 'default'
        <FormGroup>
            <InputGroup className = {'webapp-examples-search'}>
                <FormControl
                    ref         = {'search'}
                    type        = {'text'}
                    placeholder = {'Search'}
                    value       = {@props.search_str ? ''}
                    onKeyUp     = {@handle_search_keyup}
                    onChange    = {@search}
                />
                <InputGroup.Button>
                    <Button
                        onClick  = {@search_clear}
                        bsStyle  = {bsStyle}
                    >
                        <Icon name={'times-circle'} />
                    </Button>
                </InputGroup.Button>
            </InputGroup>
        </FormGroup>

    render: ->
        return null if (not @props.lang?) or (not @props.lang_select?)
        show_lang_nav = @props.lang_select and not @props.unknown_lang
        <div style={outer_style}>
            <div style={title_style}>
                <h2>
                    <Icon name={exports.ICON_NAME} />
                    <Space/>
                    {lang2name(@props.lang) if not @props.lang_select} Assistant
                </h2>
            </div>
            <div style={nav_style}>
                {@render_nav() if show_lang_nav}
            </div>
            <div style={search_style}>
                {@render_search() if not @props.unknown_lang}
            </div>
        </div>


ExamplesBody = rclass
    displayName : 'ExamplesBody'

    propTypes:
        actions             : rtypes.object
        data                : rtypes.immutable
        lang                : rtypes.string
        code                : rtypes.string
        descr               : rtypes.string
        setup_code          : rtypes.string
        prepend_setup_code  : rtypes.bool
        cat0                : rtypes.number
        cat1                : rtypes.number
        cat2                : rtypes.number
        catlist0            : rtypes.arrayOf(rtypes.string)
        catlist1            : rtypes.arrayOf(rtypes.string)
        catlist2            : rtypes.arrayOf(rtypes.string)
        search_str          : rtypes.string
        search_sel          : rtypes.number
        hits                : rtypes.arrayOf(rtypes.array)
        unknown_lang        : rtypes.bool   # if true, show info about contributing to the assistant

    getDefaultProps: ->
        search_str : ''

    shouldComponentUpdate: (props, state) ->
        ret = misc.is_different(@props, props, [
            'data', 'lang', 'code', 'descr', 'setup_code', 'prepend_setup_code',
            'cat0', 'cat1', 'cat2',
            'search_str', 'search_sel', 'unknown_lang'
        ])
        ret or= misc.is_different_array(props.hits, @props.hits)
        ret or= misc.is_different_array(props.catlist0, @props.catlist0)
        ret or= misc.is_different_array(props.catlist1, @props.catlist1)
        ret or= misc.is_different_array(props.catlist2, @props.catlist2)
        return ret

    componentDidMount: ->
        @scrollTo0 = _.debounce((() -> $(ReactDOM.findDOMNode(@refs.list_0)).find('.active').scrollintoview()), 50)
        @scrollTo1 = _.debounce((() -> $(ReactDOM.findDOMNode(@refs.list_1)).find('.active').scrollintoview()), 50)
        @scrollTo2 = _.debounce((() -> $(ReactDOM.findDOMNode(@refs.list_2)).find('.active').scrollintoview()), 50)
        @scrollToS = _.debounce((() -> $(ReactDOM.findDOMNode(@refs.search_results_list)).find('.active').scrollintoview()), 50)

    componentDidUpdate: (props, state) ->
        @scrollTo0() if props.cat0 != @props.cat0
        @scrollTo1() if props.cat1 != @props.cat1
        @scrollTo2() if props.cat2 != @props.cat2
        @scrollToS() if props.search_sel != @props.search_sel

    category_selection: (level, idx) ->
        @props.actions.set_selected_category(level, idx)

    # level could be 0, 1 or 2
    category_list: (level) ->
        cat  = @props["cat#{level}"]
        list = @props["catlist#{level}"]
        list ?= []
        # don't use ListGroup & ListGroupItem with onClick, because then there are div/buttons (instead of ul/li) and layout is f'up
        <ul className={'list-group'} ref={"list_#{level}"}>
        {
            list.map (name, idx) =>
                click  = @category_selection.bind(@, level, idx)
                active = if idx == cat then 'active' else ''
                <li className={"list-group-item " + active} onClick={click} key={idx}>
                    <Markdown value={name} />
                </li>
        }
        </ul>

    search_result_selection: (idx) ->
        @props.actions.search_selected(idx)

    render_search_results: ->
        ss = @props.search_str
        <ul className={'list-group'} ref={'search_results_list'}>
        {
            @props.hits.map (hit, idx) =>
                [lvl1, lvl2, lvl3, title, descr, inDescr] = hit
                click    = @search_result_selection.bind(@, idx)
                # highlight the match in the title
                title_hl = title.replace(new RegExp(ss, "gi"), "<span class='hl'>#{ss}</span>")
                # if the hit is in the description, highlight it too
                if inDescr != -1
                    i = Math.max(0, inDescr-30)
                    j = Math.min(descr.length, inDescr+30+ss.length)
                    t = descr[inDescr...inDescr+ss.length]
                    snippet = descr[i..j].replace(new RegExp(ss, "gi"), "<span class='hl'>#{t}</span>")
                    if i > 0
                        snippet = '...' + snippet
                    if j < descr.length
                        snippet = snippet + '...'
                active = if @props.search_sel == idx then 'active' else ''
                <li
                    key          = {idx}
                    className    = {"list-group-item " + active}
                    onClick      = {click}
                >
                    {lvl1} → {lvl2} → <span style={fontWeight: 'bold'} dangerouslySetInnerHTML={__html : title_hl}></span>
                    {' '}
                    {<span className={'snippet'} dangerouslySetInnerHTML={__html : snippet}></span> if snippet?.length > 0}
                </li>
        }
        </ul>

    render_top: ->
        searching = @props.search_str?.length > 0
        <Row key={'top'}>
        {
            if not @props.data?
                <Col md={12} style={textAlign: 'center'}>
                    <Loading />
                </Col>
            else if searching
                <Col sm={12}>{@render_search_results()}</Col>
            else
                [
                    <Col sm={3} key={0}>{@category_list(0)}</Col>
                    <Col sm={3} key={1}>{@category_list(1)}</Col>
                    <Col sm={6} key={2}>{@category_list(2)}</Col>
                ]
        }
        </Row>

    render_bottom: ->
        # TODO syntax highlighting
        code = @props.code
        if @props.setup_code?.length > 0 and @props.prepend_setup_code
            code = "#{@props.setup_code}\n#{code}"
        <Row key={'bottom'}>
            <Col sm={6}>
                <pre ref={'code'} className={'code'}>{code}</pre>
            </Col>
            <Col sm={6}>
                <Panel ref={'descr'} className={'webapp-examples-descr'}>
                    <Markdown value={@props.descr} />
                </Panel>
            </Col>
        </Row>

    # top is the selector or search results list; bottom displays a selected document
    render_body: ->
        [
            @render_top()
            @render_bottom()
        ]

    render_unknown_lang: ->
        <Row>
            <Col sm={12}>
                Selected language <code>{@props.lang}</code> has no data.
                You can help by contributing more content at{' '}
                <a href={REPO_URL} target={'_blank'}>
                    {'sagemathinc/cocalc-assistant'}
                </a>.
            </Col>
        </Row>

    render: ->
        <Modal.Body className={'modal-body'}>
            {
                if @props.unknown_lang
                    @render_unknown_lang()
                else
                    @render_body()
            }
        </Modal.Body>

# The root element of the Assistant dialog.
RExamples = (name) -> rclass
    displayName : 'Examples'

    reduxProps :
        "#{name}" :
            show                : rtypes.bool
            lang                : rtypes.string      # the currently selected language
            lang_select         : rtypes.bool        # show buttons to allow selecting the language
            code                : rtypes.string      # displayed content of selected document
            descr               : rtypes.string      # markdown-formatted content of document description
            setup_code          : rtypes.string      # optional, common code in the sub-category
            prepend_setup_code  : rtypes.bool        # if true, setup code is prepended to code
            data                : rtypes.immutable   # this is the processed "raw" data, see Actions::load_data
            nav_entries         : rtypes.arrayOf(rtypes.string)  # languages at the top, iff lang_select is true
            catlist0            : rtypes.arrayOf(rtypes.string)  # list of first category entries
            catlist1            : rtypes.arrayOf(rtypes.string)  # list of second level categories
            catlist2            : rtypes.arrayOf(rtypes.string)  # third level are the document titles
            cat0                : rtypes.number      # index of selected first category (left)
            cat1                : rtypes.number      # index of selected second category (second from left)
            cat2                : rtypes.number      # index of selected third category (document titles)
            search_str          : rtypes.string      # substring to search for -- or undefined
            search_sel          : rtypes.number      # index of selected matched documents
            submittable         : rtypes.bool        # if true, the buttons at the bottom are active
            hits                : rtypes.arrayOf(rtypes.array)  # search results
            unknown_lang        : rtypes.bool        # true if there is no known set of documents for the language


    propTypes :
        actions : rtypes.object.isRequired

    shouldComponentUpdate: (props, state) ->
        ret = misc.is_different(@props, props, [
            'show', 'lang', 'code', 'descr', 'setup_code', 'prepend_setup_code', 'data',
            'cat0', 'cat1', 'cat2',
            'search_str', 'search_sel', 'unknown_lang', 'submittable'
        ])
        ret or= misc.is_different_array(props.hits, @props.hits)
        ret or= misc.is_different_array(props.nav_entries, @props.nav_entries)
        ret or= misc.is_different_array(props.catlist0, @props.catlist0)
        ret or= misc.is_different_array(props.catlist1, @props.catlist1)
        ret or= misc.is_different_array(props.catlist2, @props.catlist2)
        return ret

    close: ->
        @props.actions.hide()

    insert_code: ->
        @props.actions.insert(false)
        @close()

    insert_all: ->
        @props.actions.insert(true)
        @close()

    handle_dialog_keyup: (evt) ->
        switch evt.keyCode
            when 13 #return
                if @props.submittable
                    @submit()
            when 27 # ESC
                return true # will close the dialog
            when 38 # up
                dir = -1
            when 40 # down
                dir = +1
            else
                nothing = true
        if dir?
            if @props.search_str?.length > 0 # active search
                @props.actions.search_cursor(dir)
            else
                @props.actions.select_cursor(dir)
        evt.preventDefault() # which
        evt.stopPropagation() # does
        evt.nativeEvent.stopImmediatePropagation() # what ?!
        return false

    handle_prepend_setup_code: (value) ->
        @props.actions.set(prepend_setup_code:value)

    render: ->
        <Modal
            show      = {@props.show}
            onKeyUp   = {@handle_dialog_keyup}
            onHide    = {@close}
            bsSize    = {'large'}
            className = {'webapp-examples'}
        >
            <Modal.Header closeButton className={'modal-header'}>
               <ExamplesHeader
                   actions      = {@props.actions}
                   lang_select  = {@props.lang_select}
                   unknown_lang = {@props.unknown_lang}
                   lang         = {@props.lang}
                   search_str   = {@props.search_str}
                   nav_entries  = {@props.nav_entries}
               />
            </Modal.Header>

            <ExamplesBody
                actions            = {@props.actions}
                lang               = {@props.lang}
                unknown_lang       = {@props.unknown_lang}
                code               = {@props.code}
                setup_code         = {@props.setup_code}
                prepend_setup_code = {@props.prepend_setup_code}
                descr              = {@props.descr}
                cat0               = {@props.cat0}
                cat1               = {@props.cat1}
                cat2               = {@props.cat2}
                catlist0           = {@props.catlist0}
                catlist1           = {@props.catlist1}
                catlist2           = {@props.catlist2}
                search_str         = {@props.search_str}
                search_sel         = {@props.search_sel}
                hits               = {@props.hits}
                data               = {@props.data}
            />

            <Modal.Footer>
                <Button
                    className  = {'contrib-link'}
                    href       = {REPO_URL}
                    target     = {'_blank'}
                >
                    <Icon name = {'code-fork'} /> Contribute
                </Button>
                <Button
                    onClick    = {@props.actions.hide}
                    className  = {'pull-right'}
                >
                    Close
                </Button>
                <Button
                    onClick    = {@insert_code}
                    disabled   = {not @props.submittable}
                    bsStyle    = {'success'}
                    className  = {'pull-right'}
                >
                    Only Code
                </Button>
                <Button
                    onClick   = {@insert_all}
                    disabled  = {not @props.submittable}
                    bsStyle   = {'success'}
                    className = {'pull-right'}
                    style     = {fontWeight:'bold'}
                >
                    Insert Example
                </Button>
                {
                    if @props.setup_code?.length > 0
                        <Checkbox
                            className = {'pull-right'}
                            style     = {margin: '10px', display: 'inline'}
                            checked   = {@props.prepend_setup_code}
                            onChange  = {(e)=>@handle_prepend_setup_code(e.target.checked)}
                        >
                            Setup code
                        </Checkbox>
                }
            </Modal.Footer>
        </Modal>

### Public API ###

init_action_and_store = (name) ->
    store   = redux.createStore(makeExamplesStore(name))
    actions = redux.createActions(name, ExamplesActions)
    actions._init(store)
    return [actions, store]

# The following two exports are used in jupyter/main and ./register
exports.instantiate_assistant = (project_id, path) ->
    name = redux_name(project_id, path)
    actions = redux.getActions(name)
    if not actions?
        [actions, store] = init_action_and_store(name)
    return actions

exports.instantiate_component = (project_id, path, actions) ->
    name = redux_name(project_id, path)
    W = RExamples(name)
    return <Redux redux={redux}><W actions={actions}/></Redux>

# and this one below is used in editor.coffee for sagews worksheets.
# "target" is a DOM element somewhere in the buttonbar of the editor's html
exports.render_examples_dialog = (opts) ->
    opts = defaults opts,
        target     : required
        project_id : required
        path       : required
        lang       : 'sage'
    name = redux_name(opts.project_id, opts.path)
    actions = redux.getActions(name)
    if not actions?
        [actions, store] = init_action_and_store(name)
    actions.init(opts.lang)
    actions.set(lang_select:true)
    W = RExamples(name)
    ReactDOM.render(<Redux redux={redux}><W actions={actions}/></Redux>, opts.target)
    return actions
