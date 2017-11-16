###############################################################################
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
###############################################################################

underscore = _ = require('underscore')
misc = require('smc-util/misc')
misc_page = require('./misc_page')

{React, ReactDOM, Actions, Store, Table, rtypes, rclass, Redux}  = require('./smc-react')
{Col, Row, Button, ButtonGroup, ButtonToolbar, FormControl, FormGroup, Panel, Input,
Well, SplitButton, MenuItem, Alert, ListGroup, ListGroupItem} = require('react-bootstrap')
{Icon, Markdown, ProjectState, Space, TimeAgo} = require('./r_misc')
{ErrorDisplay, Icon, Loading, TimeAgo, Tip, ImmutablePureRenderMixin, Space} = require('./r_misc')
{webapp_client} = require('./webapp_client')

# src: where the library files are
# start: open this file after copying the directory
exports.LIBRARY = LIBRARY =
    first_steps :
        src    : '/ext/library/first-steps/src'
        start  : 'first-steps.tasks'

# https://github.com/sagemathinc/cocalc-examples
exports.examples_path = ROOT = '/ext/library/cocalc-examples'

sortBy = (key) ->
    (list) ->
        _.sortBy(list, (k) -> k[key]?.toLowerCase() ? k)

exports.Library = rclass ({name}) ->
    displayName : 'Library'

    reduxProps :
        "#{name}" :
            current_path        : rtypes.string
            library             : rtypes.object

    propTypes :
        actions  : rtypes.object.isRequired

    getInitialState: ->
        lang      : 'python'
        selected  : undefined
        copy      : false

    copy: (doc) ->
        console.log("copy from", doc.src)

    selector: ->
        list_style =
            maxHeight  : '200px'
            overflowX  : 'hidden'
            overflowY  : 'scroll'

        <ListGroup style={list_style}>
        {
            examples = @props.library.examples
            sortBy('title')(examples.documents).map (doc) =>
                <ListGroupItem
                    key     = {doc.id}
                    active  = {doc.id == @state.selected?.id}
                    onClick = {=> @setState(selected:doc)}
                    style   = {width:'100%', margin: '2px'}
                    bsSize  = {'small'}
                >
                    {doc.title ? doc.id}
                </ListGroupItem>
        }
        </ListGroup>

    details: ->
        return null if (not @state.selected?)
        # {"title":"Data science Python notebooks","id":"doc-6","license":"a20",
        # "src":"/ext/library/cocalc-examples/data-science-ipython-notebooks/",
        # "description":"Data science Python notebooks: Deep learning ...\n"}
        doc  = @state.selected
        meta = @props.library.examples.metadata
        <div>
            <p>
                <strong>{doc.title ? doc.id}</strong>
                {" by #{doc.author}" if doc.author?}
            </p>
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
                onClick  = {=> @copy(doc)}
            >
                Get a Copy
            </Button>
        </div>

    render: ->
        #if DEBUG then console.log('library/selector/library:', @props.library)
        return <Loading /> if not @props.library?.examples?

        <Row>
            <Col sm=4>
                {@selector()}
            </Col>
            <Col sm=8>
                {@details()}
            </Col>
        </Row>
