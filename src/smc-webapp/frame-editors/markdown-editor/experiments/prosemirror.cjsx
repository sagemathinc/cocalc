#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Use ProseMirror to provide a WYSIWYG Markdown editing experience.

Mainly just for fun...
###

{Loading, Markdown} = require('smc-webapp/r_misc')
{React, ReactDOM, rclass, rtypes}  = require('smc-webapp/app-framework')
{Button} = require('react-bootstrap')

options = require('./options')

exports.ProseMirror = rclass
    displayName: 'MarkdownEditor-ProseMirror'

    propTypes :
        id         : rtypes.string.isRequired
        actions    : rtypes.object.isRequired
        path       : rtypes.string.isRequired
        project_id : rtypes.string.isRequired
        font_size  : rtypes.number.isRequired
        read_only  : rtypes.bool
        value      : rtypes.string

    render: ->
        <div style={overflow:'auto', width:'100%', fontSize:"#{@props.font_size}px"}>
            <div
                style           = {maxWidth: options.MAX_WIDTH, margin: '0 auto', padding:'10px'}
                >
                <Markdown
                    value            = {@props.value}
                    project_id       = {@props.project_id}
                    file_path        = {@props.path}
                    ref              = {'markdown'}
                    content_editable = {true}
                    style            = {outline:'none'}
                />
            </div>
        </div>
