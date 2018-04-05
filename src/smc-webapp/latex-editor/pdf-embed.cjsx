###
This is a renderer using the embed tag, so works with browsers that have a PDF viewer plugin.
###

{throttle} = require('underscore')

{React, ReactDOM, rclass, rtypes} = require('../smc-react')

{Loading} = require('../r_misc')

util = require('../code-editor/util')

exports.PDFEmbed = rclass
    displayName: 'LaTeXEditor-PDFEmbed'

    propTypes :
        id            : rtypes.string.isRequired
        actions       : rtypes.object.isRequired
        editor_state  : rtypes.immutable.Map
        is_fullscreen : rtypes.bool
        project_id    : rtypes.string
        path          : rtypes.string
        reload        : rtypes.number
        font_size     : rtypes.number

    render: ->
        src = "#{util.raw_url(@props.project_id, @props.path)}?param=#{@props.reload}"
        <embed
            width  = {"100%"}
            height = {"100%"}
            src    = {src}
            type   = {"application/pdf"}
        />
