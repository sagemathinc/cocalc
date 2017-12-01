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

$              = window.$
underscore = _ = require('underscore')
misc           = require('smc-util/misc')
misc_page      = require('./misc_page')
os_path        = require('path')

{React, ReactDOM, Actions, Store, Table, rtypes, rclass, Redux}  = require('./smc-react')
{Col, Row, Button, ButtonGroup, ButtonToolbar, FormControl, FormGroup, Panel, Input, Well, SplitButton, MenuItem, Alert, ListGroup, ListGroupItem} = require('react-bootstrap')
{Markdown, Space, TimeAgo, ErrorDisplay, Icon, Loading, TimeAgo, Tip, Space} = require('./r_misc')
{webapp_client} = require('./webapp_client')
{COLORS}        = require('smc-util/theme')

# src: where the library files are
# start: open this file after copying the directory
exports.LIBRARY = LIBRARY =
    first_steps :
        src    : '/ext/library/first-steps/src'
        start  : 'first-steps.tasks'

# used for some styles
HEIGHT = '275px'

# https://github.com/sagemathinc/cocalc-examples
exports.examples_path = ROOT = '/ext/library/cocalc-examples'

sortBy = (key) ->
    (list) ->
        _.sortBy(list, (k) -> k[key]?.toLowerCase() ? k)

# This is the main library component. It consists of a "selector" and a preview.
# Later, we probably want to filter by tags, free-text search, ... but for now we just have the main categories
exports.Library = rclass ({name}) ->
    displayName : "Library-#{name}"

    reduxProps :
        "#{name}" :
            current_path        : rtypes.string
            library             : rtypes.immutable.Map
            library_selected    : rtypes.object
        projects:
            project_map         : rtypes.immutable

    propTypes :
        actions  : rtypes.object.isRequired

    getInitialState: ->
        lang        : 'python'
        copy        : false
        show_thumb  : false
        sorted_docs : undefined
        metadata    : undefined

    componentDidMount: ->
        # TODO this isn't working
        #@scroll_into_view = _.debounce((=> $(ReactDOM.findDOMNode(@refs.selector_list)).find('.active').scrollintoview()), 50)

    componentDidUpdate: (props, state) ->

    init_state: (props) ->
        meta = props.library.getIn(['examples'])?.metadata
        docs = props.library.getIn(['examples'])?.documents

        if docs?
            # sort by a triplet: idea is to have the docs sorted by their category,
            # where some categories have weights (e.g. "introduction" comes first, no matter what)
            sortfn = (doc) -> [
                meta.categories[doc.category].weight ? 0
                meta.categories[doc.category].name.toLowerCase()
                doc.title?.toLowerCase() ? doc.id
            ]
            sdocs  = _.sortBy(docs, sortfn)
            @setState
                copy        : false
                sorted_docs : sdocs
                metadata    : meta

    componentDidMount: ->
        @init_state(@props)

    componentWillReceiveProps: (next) ->
        return if @props.library.get('examples')? and (@props.library.get('examples') == next.library.get('examples'))
        @init_state(next)

    # this might be better off in actions. the purpose is to prepare the target for the rsync operation.
    # so far, this works well for all directories -- marked by a "/" at the end.
    target_path: ->
        doc = @props.library_selected
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

    # This is the core part of all this: copy over the directory (TODO: a single file)
    # from the global read-only dir to the user's current directory
    copy: (doc) ->
        @setState(copy: true)
        doc = @props.library_selected
        @props.actions.copy_from_library
            src    : doc.src
            target : @target_path()
            title  : doc.title
            docid  : doc.id
            start  : doc?.start ? '/'
            # cb     : => if @isMounted() then @setState(copy: false)   # deprecated, hmm... copy-state is reset anyways

    selector_keyup: (evt) ->
        return if not @props.library_selected?
        switch evt.keyCode
            when 38 # up
                dx = -1
            when 40 # down
                dx = 1
        ids     = (doc.id for doc in @state.sorted_docs)
        idx     = ids.indexOf(@props.library_selected.id) + dx
        new_doc = @state.sorted_docs[idx %% @state.sorted_docs.length]
        @props.actions.setState(library_selected: new_doc)
        $(ReactDOM.findDOMNode(@refs.selector_list)).find('.active').scrollintoview()

        evt.preventDefault()
        evt.stopPropagation()
        evt.nativeEvent.stopImmediatePropagation()
        return false


    select_list_click: (doc) ->
        @setState(show_thumb:false)  # we control the visibility of the thumbnail, because it would show to the old one until the new one is loaded
        @props.actions.setState(library_selected:doc)


    select_list: (list) ->
        return null if not @state.sorted_docs?

        item_style =
            width        : '100%'
            margin       : '2px 0px'
            padding      : '5px'
            border       : 'none'
            textAlign    : 'left'

        list    = []
        cur_cat = undefined

        @state.sorted_docs.map (doc) =>
            #new category? insert a header into the list ...
            if doc.category isnt cur_cat
                cur_cat         = doc.category
                cur_cat_title   = @state.metadata.categories[cur_cat].name
                list.push(<li className="list-group-header" key={"header-#{cur_cat}"}>{cur_cat_title}</li>)

            # the entry for each available document
            list.push(
                <ListGroupItem
                    key         = {doc.id}
                    active      = {doc.id == @props.library_selected?.id}
                    onClick     = {=> @select_list_click(doc)}
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
        return null if (not @props.library_selected.thumbnail?) or (not @props.project_id)

        img_path = webapp_client.read_file_from_project
            project_id : @props.project_id
            path       : @props.library_selected.thumbnail

        img_style =
            display       : if @state.show_thumb then 'block' else 'none'
            maxHeight     : '100%'
            maxWidth      : '100%'
            border        : "1px solid #{COLORS.GRAY_L}"
            boxShadow     : "2px 2px 1px #{COLORS.GRAY_LL}"
            borderRadius  : '5px'

        return <img src={img_path} style={img_style} onLoad={=> @setState(show_thumb:true)} />


    details: ->
        return null if (not @props.library_selected?) or (not @state.metadata?)
        # example:
        # {"title":"Data science Python notebooks","id":"doc-6","license":"a20",
        # "src":"/ext/library/cocalc-examples/data-science-ipython-notebooks/",
        # "description":"Data science Python notebooks: Deep learning ...\n"}
        doc   = @props.library_selected
        meta  = @state.metadata
        style =
            maxHeight  : HEIGHT
            overflow   : 'auto'

        # this tells the user additional information for specific tags (like, pick the right kernel...)
        tag_extra_info = []
        for tag in doc.tags ? []
            info = @state.metadata.tags[tag].info
            tag_extra_info.push(info) if info

        <div style={style}>
            <h5 style={marginTop: '0px'}>
                <strong>{doc.title ? doc.id}</strong>
                {" by #{doc.author}" if doc.author?}
            </h5>
            {
                if doc.description?
                    <p style={color: COLORS.GRAY_D}>
                        <Markdown value={doc.description} />
                    </p>
            }
            {
                if doc.website?
                    website_style =
                        whiteSpace    : 'nowrap'
                        overflow      : 'hidden'
                        textOverflow  : 'ellipsis'
                    <p style={color: COLORS.GRAY_D}>
                        Website: <a style={website_style} target='_blank' href={doc.website}>{doc.website}</a>
                    </p>
            }
            {
                if doc.license?
                    <p style={color: COLORS.GRAY_D}>
                        License: {meta.licenses[doc.license] ? doc.license}
                    </p>
            }
            {
                if doc.tags?
                    tags = ((meta.tags[t].name ? t) for t in doc.tags)
                    <p style={color: COLORS.GRAY_D}>
                        Tags: {tags.join(', ')}
                    </p>
            }
            {#<p style={color: '#666'}>copies <code>{@props.library_selected.src}</code> into <code>{@target_path()}</code></p>}
            {
                if tag_extra_info.length > 0
                    info = tag_extra_info.join(' ')
                    <p style={color: COLORS.GRAY_D}>
                        <Icon name='exclamation-triangle' style={color:COLORS.YELL_L} /> {info}
                    </p>
            }
            <Button
                bsStyle  = "success"
                onClick  = {=> @copy()}
                disabled = {@state.copy}
            >
                {
                    if @state.copy
                        <span><Loading text='Copying ...' /></span>
                    else
                        <span><Icon name='files-o' /> Get a copy</span>
                }
            </Button>
        </div>

    render: ->
        #if DEBUG then console.log('library/selector/library:', @props.library)
        project = @props.project_map?.get(@props.project_id)
        state   = project?.get('state')?.get('state')

        if state and state != 'running'
            return <span>Project not running</span>

        if (not @props.library?.get('examples')?)
            return <Loading />

        thumb = @props.library_selected?.thumbnail
        <Row>
            <Col sm=4>{@selector()}</Col>
            <Col sm={if thumb then 6 else 8}>{@details()}</Col>
            {<Col sm=2>{@thumbnail()}</Col> if thumb}
        </Row>
 