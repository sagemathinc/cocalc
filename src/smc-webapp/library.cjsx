##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2017, Sagemath Inc.
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

underscore = _ = require('underscore')
misc = require('smc-util/misc')
misc_page = require('./misc_page')
os_path = require('path')

{React, ReactDOM, Actions, Store, Table, rtypes, rclass, Redux}  = require('./smc-react')
{Col, Row, Button, ButtonGroup, ButtonToolbar, FormControl, FormGroup, Panel, Input,
Well, SplitButton, MenuItem, Alert, ListGroup, ListGroupItem} = require('react-bootstrap')
{Icon, Markdown, ProjectState, Space, TimeAgo} = require('./r_misc')
{ErrorDisplay, Icon, Loading, TimeAgo, Tip, ImmutablePureRenderMixin, Space} = require('./r_misc')
{webapp_client} = require('./webapp_client')
{COLORS} = require('smc-util/theme')

# src: where the library files are
# start: open this file after copying the directory
exports.LIBRARY = LIBRARY =
    first_steps :
        src    : '/ext/library/first-steps/src'
        start  : 'first-steps.tasks'

HEIGHT = '250px'

# https://github.com/sagemathinc/cocalc-examples
exports.examples_path = ROOT = '/ext/library/cocalc-examples'

sortBy = (key) ->
    (list) ->
        _.sortBy(list, (k) -> k[key]?.toLowerCase() ? k)


exports.Library = rclass ({name}) ->
    displayName : 'Library'

    reduxProps :
        "#{name}" :
            project_id          : rtypes.string
            current_path        : rtypes.string
            library             : rtypes.immutable.Map
        projects:
            project_map         : rtypes.immutable

    propTypes :
        actions  : rtypes.object.isRequired

    getInitialState: ->
        lang        : 'python'
        selected    : undefined
        hovered     : undefined
        copy        : false
        show_thumb  : false
        sorted_docs : undefined
        metadata    : undefined

    componentDidMount: ->
        @scroll_into_view = _.debounce((-> $(ReactDOM.findDOMNode(@refs.selector_list)).find('.active').scrollintoview()), 50)

    componentDidUpdate: (props, state) ->
        @scroll_into_view()

    componentWillMount: ->
        meta = @props.library.getIn(['examples'])?.metadata
        docs = @props.library.getIn(['examples'])?.documents

        if docs?
            sortfn = (doc) -> [meta.categories[doc.category], doc.title?.toLowerCase() ? doc.id]
            sdocs  = _.sortBy(docs, sortfn)
            @setState
                copy        : false
                sorted_docs : sdocs
                metadata    : meta

    target_path: ->
        doc = @state.selected
        src = doc.src
        if doc.subdir
            subdir = doc.subdir
        else
            # directory? cut off the trailing slash
            if src[src.length - 1] == '/'
                src = src[...-1]
                # subdir in current path is the name of the directory
                subdir = misc.path_split(src).tail
            else    # otherwise, we're about to copy over a single file → no subdirectory!
                subdir = ''
        target = os_path.join(@props.current_path, subdir)
        #if DEBUG then console.log("copy from", doc.src, "to", target)
        return target

    copy: (doc) ->
        @setState(copy: true)
        doc = @state.selected
        @props.actions.copy_from_library
            src    : doc.src
            target : @target_path()
            title  : doc.title
            docid  : doc.id
            start  : doc?.start ? '/'
            # cb     : => if @isMounted() then @setState(copy: false)   # deprecated, hmm...

    selector_keyup: (evt) ->
        return if not @state.selected?
        switch evt.keyCode
            when 38 # up
                dx = -1
            when 40 # down
                dx = 1
        idx     = @state.sorted_docs.indexOf(@state.selected) + dx
        new_doc = @state.sorted_docs[idx %% @state.sorted_docs.length]
        @setState(selected: new_doc)

        evt.preventDefault()
        evt.stopPropagation()
        evt.nativeEvent.stopImmediatePropagation()
        return false

    select_list: (list) ->

        item_style =
            width        : '100%'
            margin       : '2px 0px'
            padding      : '5px'
            border       : 'none'
            textAlign    : 'left'

        list    = []
        cur_cat = undefined

        @state.sorted_docs.map (doc) =>
            if doc.category isnt cur_cat
                cur_cat         = doc.category
                cur_cat_title   = @state.metadata.categories[cur_cat]
                list.push(<li class="list-group-header" key={"header-#{cur_cat}"}>{cur_cat_title}</li>)

            list.push(
                <ListGroupItem
                    key         = {doc.id}
                    active      = {doc.id == @state.selected?.id}
                    onClick     = {=> @setState(selected:doc, show_thumb:false)}
                    style       = {item_style}
                    bsSize      = {'small'}
                >
                    {doc.title ? doc.id}
                </ListGroupItem>
            )
        return list

    selector: ->
        list_style =
            maxHeight    : HEIGHT
            overflowX    : 'hidden'
            overflowY    : 'scroll'
            border       : "1px solid #{COLORS.GRAY_LL}"
            borderRadius : '5px'
            marginBottom : '0px'

        <ListGroup style={list_style} onKeyUp={@selector_keyup} ref='selector_list'>
            {@select_list()}
        </ListGroup>

    thumbnail: ->
        return null if (not @state.selected.thumbnail?) or (not @props.project_id)

        img_path = webapp_client.read_file_from_project
            project_id : @props.project_id
            path       : @state.selected.thumbnail

        img_style =
            display   : if @state.show_thumb then 'block' else 'none'
            maxHeight : '100%'
            maxWidth  : '100%'
            border    : "1px solid #{COLORS.GRAY_LL}"
            boxShadow : "3px 3px 1px #{COLORS.GRAY_LLL}"

        return <img src={img_path} style={img_style} onLoad={=> @setState(show_thumb:true)} />


    details: ->
        return null if (not @state.selected?)
        # example:
        # {"title":"Data science Python notebooks","id":"doc-6","license":"a20",
        # "src":"/ext/library/cocalc-examples/data-science-ipython-notebooks/",
        # "description":"Data science Python notebooks: Deep learning ...\n"}
        doc   = @state.selected
        meta  = @state.metadata
        style =
            maxHeight  : HEIGHT
            overflow   : 'auto'

        <div style={style}>
            <h5 style={marginTop: '0px'}>
                <strong>{doc.title ? doc.id}</strong>
                {" by #{doc.author}" if doc.author?}
            </h5>
            {
                if doc.description?
                    <p style={color: '#666'}>
                        <Markdown value={doc.description} />
                    </p>
            }
            {<p>License: {meta.licenses[doc.license] ? doc.license}</p> if doc.license?}
            {
                if doc.tags?
                    tags = ((meta.tags[t] ? t) for t in doc.tags)
                    <p>Tags: {tags.join(', ')}</p>
            }
            <Button
                bsStyle  = "success"
                onClick  = {=> @copy()}
                disabled = {@state.copy}
            >
                {
                    if @state.copy
                        'Copying ...'
                    else
                        'Get a copy'
                }
            </Button>
            {#<p style={color: '#666'}>copies <code>{@state.selected.src}</code> into <code>{@target_path()}</code></p>}
        </div>

    render: ->
        #if DEBUG then console.log('library/selector/library:', @props.library)
        project = @props.project_map?.get(@props.project_id)
        state   = project?.get('state')?.get('state')

        if state and state != 'running'
            return <span>Project not running</span>

        if (not @props.library?.get('examples')?) # or (not @state.sorted_docs?)
            return <Loading />

        thumb = @state.selected?.thumbnail
        <Row>
            <Col sm=4>{@selector()}</Col>
            <Col sm={if thumb then 6 else 8}>{@details()}</Col>
            {<Col sm=2>{@thumbnail()}</Col> if thumb}
        </Row>
