###
The format bar
###

css_colors = require('css-color-names')

misc = require('smc-util/misc')

{ButtonGroup, Button, DropdownButton, MenuItem}   = require('react-bootstrap')

buttonbar               = require('../buttonbar')
{React, rclass, rtypes} = require('../smc-react')
{Icon, Space}           = require('../r_misc')


FONT_SIZES = 'xx-small x-small small medium large x-large xx-large'.split(' ')

exports.FormatBar = rclass
    propTypes :
        actions : rtypes.object.isRequired

    shouldComponentUpdate: ->
        # never update -- expensive and not needed!
        return false

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
            {@render_button('link', 'Insert link', 'link')}
            {@render_button('image', 'Insert image', 'image')}
        </ButtonGroup>

    render_format_buttons: ->
        <ButtonGroup key={'format'}>
            {@render_button('format_code', 'Format selected text as code', 'code')}
            {@render_button('justifyleft', 'Left justify current text', 'align-left')}
            {@render_button('justifycenter', 'Center current text', 'align-center')}
            {@render_button('justifyright', 'Right justify current text', 'align-right')}
            {@render_button('justifyfull', 'Fully justify current text', 'align-justify')}
            {@render_button('outdent', 'Move selected text to the left', 'outdent')}
            {@render_button('indent', 'Indent selected text to the right', 'indent')}
            {@render_button('unformat', 'Remove formatting from selected text', 'remove')}
        </ButtonGroup>

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
                             onSelect={(size)=>@props.actions.format_action('font_size', size)}
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
                       onSelect={(heading)=>@props.actions.format_action('heading', heading)}
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
                             onSelect={(code)=>@props.actions.format_action('font_color', code)}
                    >
                    <span style={background: code}><Space/><Space/><Space/><Space/></span> {color}
                </MenuItem>
            items.push(item)
        <DropdownButton
          pullRight
          title = {'Color'}
          key   = {'font-color'}
          id    = {'font-color'}
        >
            {items}
        </DropdownButton>

    render_font_dropdowns: ->
        <ButtonGroup key={'font-dropdowns'} style={float:'right'}>
            {@render_font_family_dropdown()}
            {@render_font_size_dropdown()}
            {@render_heading_dropdown()}
            {@render_colors_dropdown()}
        </ButtonGroup>

    render: ->
        <div style={background: '#f8f8f8', margin: '0 1px'}>
            {@render_font_dropdowns()}
            <div style={maxHeight:'34px', overflow:'hidden'}>
                {@render_text_style_buttons()}
                <Space/>
                {@render_insert_buttons()}
                <Space/>
                {@render_format_buttons()}
                <Space/>
            </div>
        </div>