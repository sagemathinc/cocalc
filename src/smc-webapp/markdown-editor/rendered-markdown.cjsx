###
Component that shows rendered markdown.

It also:

   - [ ] tracks and restores scroll position
   - [ ] is scrollable
   - [ ] is zoomable
   - [ ] math is properly typeset
   - [ ] checkbox in markdown are interactive (can click them, which edits file)
###

{Loading, Markdown} = require('../r_misc')
{React, rclass, rtypes}     = require('../smc-react')

# If the user makes the viewport really wide, it is very hard to read
# the markdown, so we max the width out at 900px.  I have no idea if 900px
# is a good choice...
MAX_WIDTH = '900px'

exports.RenderedMarkdown = rclass
    displayName: 'MarkdownEditor-RenderedMarkdown'

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
            <div style={maxWidth: MAX_WIDTH, margin: '0 auto', padding:'10px'}>
                <Markdown
                    value      = {@props.value}
                    project_id = {@props.project_id}
                    file_path  = {@props.path}
                />
            </div>
        </div>

