###
The format bar
###

{debounce} = require('underscore')

css_colors = require('css-color-names')

misc = require('smc-util/misc')

{ButtonGroup, Button, DropdownButton, MenuItem}   = require('react-bootstrap')

buttonbar               = require('../buttonbar')
{React, rclass, rtypes, Fragment} = require('../smc-react')
{Icon, Space}           = require('../r_misc')

FONT_SIZES = 'xx-small x-small small medium large x-large xx-large'.split(' ')

# {InsertLink} = require('./insert-link')

exports.FormatBar = rclass
    propTypes :
        actions : rtypes.object.isRequired
        # store   : rtypes.immutable.Map      # state about format bar stored in external store

    shouldComponentUpdate: (next) ->
        return false
        #return @props.store != next.store

    render_button: (name, title, icon, label='') ->
        icon ?= name  # if icon not given, use name for it.
        <Button
            key     = {name}
            title   = {title}
            onClick = {=>@props.actions.format_action(name)}
        >
            {<Icon name={icon} /> if icon} {label}
        </Button>

    render_text_style_buttons: ->
        <ButtonGroup key={'text-style'}>
            {@render_button('bold', 'Make selected text bold')}
            {@render_button('italic', 'Make selected text italics')}
            {@render_button('underline', 'Underline selected text')}
            {@render_button('strikethrough', 'Strike through selected text')}
            {@render_button('subscript', 'Make selected text a subscript')}
            {@render_button('superscript', 'Make selected text a superscript')}
            {@render_button('comment', 'Comment out selected text')}
        </ButtonGroup>

    render_insert_buttons: ->
        <ButtonGroup key={'insert'}>
            {@render_button('equation', 'Insert inline LaTeX math', '', '$')}
            {@render_button('display_equation', 'Insert displayed LaTeX math', '', '$$')}
            {@render_button('insertunorderedlist', 'Insert unordered list', 'list')}
            {@render_button('insertorderedlist', 'Insert ordered list', 'list-ol')}
            {@render_button('quote', 'Make selected text into a quotation', 'quote-left')}
            {@render_button('table', 'Insert table', 'table')}
            {@render_button('horizontalRule', 'Insert horizontal rule', '', <span>&mdash;</span>)}
        </ButtonGroup>

    render_insert_dialog_buttons: ->
        <ButtonGroup key={'insert-dialog'}>
            {@render_button('link', 'Insert link', 'link')}
            {@render_button('image', 'Insert image', 'image')}
            {@render_button('SpecialChar', 'Insert special character...', '', <span>&Omega;</span>)}
        </ButtonGroup>

    render_format_buttons: ->
        <Fragment>
            <ButtonGroup key={'format'}>
                {@render_button('format_code', 'Format selected text as code', 'code')}
                {@render_button('justifyleft', 'Left justify current text', 'align-left')}
                {@render_button('justifycenter', 'Center current text', 'align-center')}
                {@render_button('justifyright', 'Right justify current text', 'align-right')}
                {@render_button('justifyfull', 'Fully justify current text', 'align-justify')}
            </ButtonGroup>
            <Space/>
            <ButtonGroup key={'format2'}>
                {@render_button('unformat', 'Remove all formatting from selected text', 'remove')}
            </ButtonGroup>
        </Fragment>

    render_font_family_dropdown: ->
        items = []
        for family in buttonbar.FONT_FACES
            item = <MenuItem key={family} eventKey={family}
                             onSelect={(family)=>@props.actions.format_action('font_family', family)}
                    >
                    <span style={fontFamily:family}>{family}</span>
                </MenuItem>
            items.push(item)
        <DropdownButton
          pullRight
          title = {<Icon name={'font'}/>}
          key   = {'font-family'}
          id    = {'font-family'}
        >
            {items}
        </DropdownButton>

    render_font_size_dropdown: ->
        items = []
        for size in FONT_SIZES
            item = <MenuItem key={size} eventKey={size}
                             onSelect={(size)=>@props.actions.format_action('font_size_new', size)}
                    >
                    <span style={fontSize:size}>{size} {if size=='medium' then '(default)'}</span>
                </MenuItem>
            items.push(item)
        <DropdownButton
          pullRight
          title = {<Icon name={'text-height'}/>}
          key   = {'font-size'}
          id    = {'font-size'}
        >
            {items}
        </DropdownButton>

    render_heading_dropdown: ->
        items = []
        for heading in [1..6]
            label = "Heading #{heading}"
            switch heading
                when 1
                    c = <h1>{label}</h1>
                when 2
                    c = <h2>{label}</h2>
                when 3
                    c = <h3>{label}</h3>
                when 4
                    c = <h4>{label}</h4>
                when 5
                    c = <h5>{label}</h5>
                when 6
                    c = <h6>{label}</h6>
            item = <MenuItem key={heading} eventKey={heading}
                       onSelect={(heading)=>@props.actions.format_action("format_heading_#{heading}")}
                   >
                       {c}
                    </MenuItem>
            items.push(item)
        <DropdownButton
          pullRight
          title = {<Icon name={'header'}/>}
          key   = {'heading'}
          id    = {'heading'}
        >
            {items}
        </DropdownButton>

    render_colors_dropdown: ->
        items = []
        v = ([color, code] for color, code of css_colors)
        v.sort (a,b) -> misc.cmp(a.code, b.code)
        for x in v
            color = x[0]; code = x[1]
            item = <MenuItem key={color} eventKey={code}
                             onSelect={(code)=>@props.actions.format_action('color', code)}
                    >
                    <span style={background: code}><Space/><Space/><Space/><Space/></span> {color}
                </MenuItem>
            items.push(item)
        <DropdownButton
          pullRight
          title = {<Icon name={'paint-brush'}/>}
          key   = {'font-color'}
          id    = {'font-color'}
        >
            {items}
        </DropdownButton>

    render_font_dropdowns: ->
        <ButtonGroup key={'font-dropdowns'} style={float:'right', marginRight: '1px'}>
            {@render_font_family_dropdown()}
            {@render_font_size_dropdown()}
            {@render_heading_dropdown()}
            {@render_colors_dropdown()}
        </ButtonGroup>

    ###
    render_insert_link: ->
        store = @props.store?.get('link')
        if not store?
            return
        set = (state) =>
            @props.actions.set_format_bar('link', state)
        <InsertLink
            set       = {set}
            on_submit = {=> @props.actions.format_action('link')}
            store     = {store}
        />
    ###

    render: ->
        <div style={background: '#f8f8f8', margin: '0 1px'}>
            {@render_font_dropdowns()}
            <div style={maxHeight:'34px', overflow:'hidden'}>
                {@render_text_style_buttons()}
                <Space/>
                {@render_insert_buttons()}
                <Space/>
                {@render_insert_dialog_buttons()}
                <Space/>
                {@render_format_buttons()}
                <Space/>
            </div>
            {###@render_insert_link()###}
        </div>