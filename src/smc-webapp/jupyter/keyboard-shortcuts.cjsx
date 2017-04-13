"""
The keyboard shortcuts and command listing dialog, which:

  - lets you search through all available commands
  - see and change the keyboard shortcuts for those commands
"""

misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Button, Modal} = require('react-bootstrap')
{Icon, SearchInput} = require('../r_misc')

commands = require('./commands')

SYMBOLS =
    meta   : '⌘'
    ctrl   : '⌃'
    alt    : '⌥'
    shift  : '⇧'
    return : '↩'
    space  : 'Space'
    tab    : '⇥'
    down   : 'down'
    up     : 'up'
    backspace : 'BS'

IS_MAC = navigator.platform.toUpperCase().indexOf('MAC') >= 0

shortcut_to_string = (shortcut) ->
    s = ''
    if shortcut.shift
        s += SYMBOLS.shift
    if shortcut.ctrl
        s += SYMBOLS.ctrl
    if shortcut.alt
        if IS_MAC
            s += SYMBOLS.meta
        else
            s += SYMBOLS.alt
    keyCode = shortcut.which
    switch keyCode
        when 8
            s += SYMBOLS.backspace
        when 13
            s += SYMBOLS.return
        when 27
            s += 'Esc'
        when 40
            s += SYMBOLS.down
        when 38
            s += SYMBOLS.up
        else
            chrCode = keyCode - (48 * Math.floor(keyCode / 48))
            chr     = String.fromCharCode(if 96 <= keyCode then chrCode else keyCode)
            s      += chr
    return s

exports.KeyboardShortcut = KeyboardShortcut = rclass
    propTypes :
        shortcut : rtypes.object.isRequired

    render: ->
        <span style={fontFamily:'monospace'}>
            {shortcut_to_string(@props.shortcut)}
        </span>

SHORTCUTS_STYLE =
    width        : '15em'
    overflowX    : 'hidden'
    border       : '1px solid transparent'
    paddingRight : '10px'

Shortcuts = rclass
    propTypes :
        actions   : rtypes.object.isRequired
        name      : rtypes.string.isRequired
        shortcuts : rtypes.array.isRequired

    getInitialState: ->
        hover : false
        add   : false
        value : ''

    edit_shortcut: (e) ->
        console.log 'edit_shortcut'
        e.stopPropagation()

    render_shortcuts: ->
        for key, shortcut of @props.shortcuts
            <span
                key     = {key}
                style   = {border: '1px solid #999', margin: '2px', padding: '1px'}>
                <KeyboardShortcut
                    key      = {key}
                    shortcut = {shortcut}
                />
            </span>

    add_shortcut_mode: (e) ->
        e.stopPropagation()
        @setState(add: true)
        console.log 'add shortcut'

    render_add_shortcut: ->
        <span
            style   = {padding:'0px 10px'}
            onClick = {@add_shortcut_mode} >
            <Icon name='plus' />
        </span>

    key_down: (e) ->
        console.log e.which, e.shiftKey
        @setState(value: shortcut_to_string(e))

    render_edit_shortcut: ->
        <input
            style       = {width:'4em'}
            autoFocus   = {true}
            ref         = 'input'
            type        = 'text'
            value       = {@state.value}
            onKeyDown   = {@key_down}
            onKeyUp     = {@key_up}
        />

    render: ->
        if @state.hover
            style = misc.merge({border:'1px solid blue', background:'white'}, SHORTCUTS_STYLE)
        else
            style = SHORTCUTS_STYLE
        <span className    = 'pull-right'
              style        = {style}
              onClick      = {@edit_shortcut}
              onMouseEnter = {=>@setState(hover:true)}
              onMouseLeave = {=>@setState(hover:false)}
              >
            {@render_add_shortcut() if @state.hover}
            {@render_edit_shortcut() if @state.add}
            <span className='pull-right'>
                {@render_shortcuts()}
            </span>
        </span>


capitalize = (s) ->
    return (misc.capitalize(x) for x in misc.split(s)).join(' ')

COMMAND_STYLE =
    cursor       : 'pointer'
    borderTop    : '1px solid #ccc'
    padding      : '5px 0 5px 10px'

Command = rclass
    propTypes :
        actions   : rtypes.object.isRequired
        name      : rtypes.string.isRequired
        desc      : rtypes.string.isRequired
        icon      : rtypes.string
        shortcuts : rtypes.array.isRequired

    getInitialState: ->
        highlight : false

    render_icon: ->
        <span style={width:'2em', display: 'inline-block'}>
            {<Icon name={@props.icon} /> if @props.icon}
        </span>

    run_command: ->
        @props.actions.command(@props.name)
        @props.actions.close_keyboard_shortcuts()

    on_click: (evt) ->
        @run_command()

    render_desc: ->
        <span style = {maxWidth:'20em', overflowX:'hidden'}>
            {@props.desc}
        </span>

    render_shortcuts: ->
        <Shortcuts
            actions   = {@props.actions}
            shortcuts = {@props.shortcuts}
            name      = {@props.name} />

    render: ->
        if @state.highlight
            style = misc.merge({backgroundColor:'#ddd'}, COMMAND_STYLE)
        else
            style = COMMAND_STYLE
        <div
            style        = {style}
            onClick      = {@on_click}
            onMouseEnter = {=>@setState(highlight:true)}
            onMouseLeave = {=>@setState(highlight:false)}
            >
            {@render_icon()}
            {@render_desc()}
            {@render_shortcuts()}
        </div>

COMMAND_LIST_STYLE =
    border       : '1px solid #ccc'
    borderRadius : '3px'
    overflowY    : 'scroll'
    maxHeight    : '50vh'

CommandList = rclass
    propTypes :
        actions  : rtypes.object.isRequired
        commands : rtypes.object.isRequired
        search   : rtypes.string

    shouldComponentUpdate: (next) ->
        return next.search != @props.search

    render_commands: ->
        v = []
        for name, val of commands.commands()
            if val?
                v.push(name:name, val:val)
        v.sort(misc.field_cmp('name'))
        cmds = []
        for x in v
            if not x.val.f?
                continue
            desc = x.val.m ? capitalize(x.name)
            if not desc?
                continue
            if desc.toLowerCase().indexOf(@props.search) == -1
                continue
            icon = x.val.i
            shortcuts = x.val.k ? []
            cmds.push <Command
                key       = {x.name}
                name      = {x.name}
                actions   = {@props.actions}
                desc      = {desc}
                icon      = {icon}
                shortcuts = {shortcuts}
            />
        return cmds

    render: ->
        <div style = {COMMAND_LIST_STYLE}>
            {@render_commands()}
        </div>


exports.KeyboardShortcuts = rclass
    propTypes :
        actions            : rtypes.object.isRequired
        keyboard_shortcuts : rtypes.immutable.Map

    getInitialState: ->
        search   : ''
        commands : commands.commands()

    close: ->
        @props.actions.close_keyboard_shortcuts()
        @props.actions.focus()

    search_change: (search) ->
        @setState(search: search)

    render_instructions: ->
        <span style={color:'#666'}>
            Click an action to perform it.
            To add a keyboard shortcut, click plus next to the key combination then type the new keys.  To remove a shortcut, click it.
        </span>

    render: ->
        <Modal show={@props.keyboard_shortcuts?.get('show')} onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title>Commands and Keyboard Shortcuts</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <SearchInput
                    autoFocus  = {true}
                    value      = {@state.search}
                    on_change  = {@search_change} />
                {@render_instructions()}
                <CommandList
                    actions  = {@props.actions}
                    commands = {@state.commands}
                    search   = {@state.search} />
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>


