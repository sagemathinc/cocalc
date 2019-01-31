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

{React, ReactDOM, Actions, Store, Table, rtypes, rclass, Redux}  = require('./app-framework')
{Col, Row, Button, ButtonGroup, ButtonToolbar, FormControl, FormGroup, Panel, Input, Well, SplitButton, MenuItem, Alert, ListGroup, ListGroupItem} = require('react-bootstrap')
{Markdown, Space, TimeAgo, ErrorDisplay, Icon, Loading, TimeAgo, Tip, Space} = require('./r_misc')
{webapp_client} = require('./webapp_client')
{COLORS}        = require('smc-util/theme')

# used for some styles
HEIGHT = '275px'

# https://github.com/sagemathinc/cocalc-examples
exports.examples_path = ROOT = '/ext/library/cocalc-examples'


# This is the main library component. It consists of a "selector" and a preview.
# Later, we probably want to filter by tags, free-text search, ... but for now we just have the main categories
exports.Library = rclass ({name}) ->
    displayName : "Library-#{name}"

    reduxProps :
        "#{name}" :
            current_path        : rtypes.string
            library             : rtypes.immutable.Map
            library_docs_sorted : rtypes.immutable.List
            library_selected    : rtypes.immutable.Map
            library_is_copying  : rtypes.bool            # for the copy button, to signal an ongoing copy process
        projects:
            project_map         : rtypes.immutable

    propTypes :
        actions  : rtypes.object.isRequired
        close    : rtypes.func

    getInitialState: ->
        lang        : 'python'
        show_thumb  : false

    metadata: ->
        @props.library?.getIn(['examples', 'metadata'])

    # this might be better off in actions. the purpose is to prepare the target for the rsync operation.
    # so far, this works well for all directories -- marked by a "/" at the end.
    target_path: ->
        doc = @props.library_selected
        src = doc.get('src')
        if doc.get('subdir')
            subdir = doc.get('subdir')
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
        @props.actions.set_library_is_copying(true)
        doc = @props.library_selected
        @props.actions.copy_from_library
            src    : doc.get('src')
            target : @target_path()
            title  : doc.get('title')
            docid  : doc.get('id')
            start  : doc?.get('start') ? '/'
            cb     : =>
                @props.actions.set_library_is_copying(false)
                @props.close?()

    selector_keyup: (evt) ->
        return if not @props.library_selected?
        switch evt.keyCode
            when 38 # up
                dx = -1
            when 40 # down
                dx = 1
        ids     = @props.library_docs_sorted.map((doc) -> doc.get('id'))
        idx     = ids.indexOf(@props.library_selected.get('id')) + dx
        new_doc = @props.library_docs_sorted.get(idx %% @props.library_docs_sorted.size)
        @props.actions.setState(library_selected: new_doc)
        $(ReactDOM.findDOMNode(@refs.selector_list)).find('.active').scrollintoview()

        evt.preventDefault()
        evt.stopPropagation()
        evt.nativeEvent.stopImmediatePropagation()
        return false


    select_list_click: (doc) ->
        # ignore selection of the very same entry
        return if doc.get('id') == @props.library_selected?.get('id')
        # we control the visibility of the thumbnail, because it would show to the old one until the new one is loaded
        @setState(show_thumb:false)
        @props.actions.setState(library_selected:doc)


    select_list: (list) ->
        return null if not @props.library_docs_sorted?

        item_style =
            width        : '100%'
            margin       : '2px 0px'
            padding      : '5px'
            border       : 'none'
            textAlign    : 'left'

        list    = []
        cur_cat = undefined

        @props.library_docs_sorted.map (doc) =>
            #new category? insert a header into the list ...
            if doc.get('category') isnt cur_cat
                cur_cat         = doc.get('category')
                cur_cat_title   = @metadata().getIn(['categories', cur_cat, 'name'])
                list.push(<li className="list-group-header" key={"header-#{cur_cat}"}>{cur_cat_title}</li>)

            # the entry for each available document
            list.push(
                <ListGroupItem
                    key         = {doc.get('id')}
                    active      = {doc.get('id') == @props.library_selected?.get('id')}
                    onClick     = {=> @select_list_click(doc)}
                    style       = {item_style}
                    bsSize      = {'small'}
                >
                    {doc.get('title') ? doc.get('id')}
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
        return null if (not @props.library_selected.get('thumbnail')?) or (not @props.project_id)

        img_path = webapp_client.read_file_from_project
            project_id : @props.project_id
            path       : @props.library_selected.get('thumbnail')

        img_style =
            display       : if @state.show_thumb then 'block' else 'none'
            maxHeight     : '100%'
            maxWidth      : '100%'
            border        : "1px solid #{COLORS.GRAY_L}"
            boxShadow     : "2px 2px 1px #{COLORS.GRAY_LL}"
            borderRadius  : '5px'

        return <img src={img_path} style={img_style} onLoad={=> @setState(show_thumb:true)} />

    copy_button: ->
        <Button
            bsStyle  = "success"
            onClick  = {=> @copy()}
            disabled = {@props.library_is_copying}
        >
            {
                if @props.library_is_copying
                    <span><Loading text='Copying ...' /></span>
                else
                    <span><Icon name='files-o' /> Get a Copy</span>
            }
        </Button>

    close_button: ->
        return if not @props.close
        <Button
            className = {"pull-right"}
            onClick   = {=> @props.close()}
        >
            Close
        </Button>

    details: ->
        return null if (not @props.library_selected?) or (not @metadata()?)
        # for doc and metadata examples see https://github.com/sagemathinc/cocalc-examples/blob/master/index.yaml
        doc   = @props.library_selected
        style =
            maxHeight  : HEIGHT
            overflow   : 'auto'

        # this tells the user additional information for specific tags (like, pick the right kernel...)
        tag_extra_info = []
        for tag in doc.get('tags') ? []
            info = @metadata().getIn(['tags', tag, 'info'])
            tag_extra_info.push(info) if info

        <div style={style}>
            <h5 style={marginTop: '0px'}>
                <strong>{doc.get('title') ? doc.get('id')}</strong>
                {" by #{doc.get('author')}" if doc.get('author')?}
            </h5>
            {
                if doc.get('description')?
                    <p style={color: COLORS.GRAY_D}>
                        <Markdown value={doc.get('description')} />
                    </p>
            }
            {
                if doc.get('website')?
                    website_style =
                        whiteSpace    : 'nowrap'
                        overflow      : 'hidden'
                        textOverflow  : 'ellipsis'
                    <p style={color: COLORS.GRAY_D}>
                        Website: <a style={website_style} target='_blank' rel='noopener' href={doc.get('website')}>{doc.get('website')}</a>
                    </p>
            }
            {
                if doc.get('license')?
                    <p style={color: COLORS.GRAY_D}>
                        License: {@metadata().getIn(['licenses', doc.get('license')]) ? doc.get('license')}
                    </p>
            }
            {
                if doc.get('tags')?
                    tags = doc.get('tags').map(((t) => @metadata().getIn(['tags', t, 'name']) ? t))
                    <p style={color: COLORS.GRAY_D}>
                        Tags: {tags.join(', ')}
                    </p>
            }
            {### <p style={color: '#666'}>copies <code>{@props.library_selected.src}</code> into <code>{@target_path()}</code></p> ###}
            {
                if tag_extra_info.length > 0
                    info = tag_extra_info.join(' ')
                    <p style={color: COLORS.GRAY_D}>
                        <Icon name='exclamation-triangle' style={color:COLORS.YELL_L} /> {info}
                    </p>
            }
            {@copy_button()}
        </div>

    render: ->
        #if DEBUG then console.log('library/selector/library:', @props.library)
        project = @props.project_map?.get(@props.project_id)
        state   = project?.get('state')?.get('state')

        if state and state != 'running'
            content = <span>Project not running</span>
        else if (not @props.library?.get('examples')?)
            content = <Loading />
        else
            thumb   = @props.library_selected?.get('thumbnail')
            content = <Row>
                          <Col sm={4}>{@selector()}</Col>
                          <Col sm={if thumb then 6 else 8}>{@details()}</Col>
                          {<Col sm={2}>{@thumbnail()}</Col> if thumb}
                      </Row>

        <>
            {content}
            {if @props.close
                <Row>
                    <Col sm={12}>{@close_button()}</Col>
                </Row>
            }
        </>
