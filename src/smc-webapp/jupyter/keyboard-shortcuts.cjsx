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

exports.KeyboardShortcut = KeyboardShortcut = rclass
    propTypes :
        shortcut : rtypes.object.isRequired

    render: ->
        s = ''
        if @props.shortcut.shift
            s += SYMBOLS.shift
        if @props.shortcut.ctrl
            s += SYMBOLS.ctrl
        if @props.shortcut.alt
            if IS_MAC
                s += SYMBOLS.meta
            else
                s += SYMBOLS.alt
        keyCode = @props.shortcut.which
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
        <span style={fontFamily:'monospace'}>
            {s}
        </span>

capitalize = (s) ->
    return (misc.capitalize(x) for x in misc.split(s)).join(' ')

Command = rclass
    propTypes :
        actions   : rtypes.object.isRequired
        desc      : rtypes.string.isRequired
        icon      : rtypes.string
        shortcuts : rtypes.array.isRequired

    render_shortcuts: ->
        for key, shortcut of @props.shortcuts
            <span key={key} style={border: '1px solid #999', margin: '2px', padding: '1px'}>
                <KeyboardShortcut
                    key      = {key}
                    shortcut = {shortcut}
                />
            </span>

    render_icon: ->
        <span style={width:'2em', display: 'inline-block'}>
            {<Icon name={@props.icon} /> if @props.icon}
        </span>

    render_desc: ->
        <span style={maxWidth:'20em', overflowX:'hidden'}>
            {@props.desc}
        </span>

    render: ->
        <div style={lineHeight: '1.5em'}>
            {@render_icon()}
            {@render_desc()}
            <span
                className = 'pull-right'
                style     = {width: '8em', overflowX: 'auto'}>
                {@render_shortcuts()}
            </span>
        </div>

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
                actions   = {@props.actions}
                desc      = {desc}
                icon      = {icon}
                shortcuts = {shortcuts}
            />
        return cmds

    render: ->
        <div style = {overflowY: 'scroll', maxHeight: '50vh'}>
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

    render: ->
        <Modal show={@props.keyboard_shortcuts?.get('show')} onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title>Commands and Keyboard Shortcuts</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <SearchInput
                    autoFocus  = {true}
                    autoSelect = {true}
                    on_change  = {@search_change} />
                <CommandList
                    actions  = {@props.actions}
                    commands = {@state.commands}
                    search   = {@state.search} />
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>


