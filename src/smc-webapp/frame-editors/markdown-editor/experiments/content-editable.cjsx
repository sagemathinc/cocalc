###
Use ContentEditable to provide a WYSIWYG Markdown editing experience.

Mainly just for fun as a proof of concept  to illustrate having many ways to view/edit a .md file.

But maybe?!

- [ ] never run mathjax/katex on the contenteditable html
- [ ] factor out math before conversion, then put back.

This will very likely be hidden/disabled in any real release; it's a horrible can of
worms to really use, and ProseMirror has already done it all!
###

{Loading, Markdown} = require('smc-webapp/r_misc')
{React, ReactDOM, rclass, rtypes}  = require('smc-webapp/smc-react')
{Button} = require('react-bootstrap')

Europa = require('europa')
europa = new Europa(inline: true)

options = require('./options.ts')

exports.ContentEditable = rclass
    displayName: 'MarkdownEditor-ContentEditable'

    propTypes :
        id         : rtypes.string.isRequired
        actions    : rtypes.object.isRequired
        path       : rtypes.string.isRequired
        project_id : rtypes.string.isRequired
        font_size  : rtypes.number.isRequired
        read_only  : rtypes.bool
        value      : rtypes.string

    save: ->
        html  = $(ReactDOM.findDOMNode(@refs.markdown)).html()
        md = europa.convert(html)
        @props.actions.set_syncstring(md)
        @props.actions.set_codemirror_to_syncstring()

    render: ->
        <div style={overflow:'auto', width:'100%', fontSize:"#{@props.font_size}px"}>
            <Button onClick={@save}>Save Changes</Button>
            <div
                style           = {maxWidth: options.MAX_WIDTH, margin: '0 auto', padding:'10px'}
                id              = {'fakeit'}
                >
                <Markdown
                    auto_render_math = {false}
                    value            = {@props.value}
                    project_id       = {@props.project_id}
                    file_path        = {@props.path}
                    ref              = {'markdown'}
                    content_editable = {true}
                    style            = {outline:'none'}
                />
            </div>
        </div>
