"""
The keyboard shortcuts and command listing dialog, which:

  - lets you search through all available commands
  - see and change the keyboard shortcuts for those commands
"""

json = require('json-stable-stringify')

misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')
{Button, Modal} = require('react-bootstrap')
{Icon, SearchInput} = require('../r_misc')

commands = require('./commands')
keyboard = require('./keyboard')

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
        s += SYMBOLS.alt
    if shortcut.meta
        s += SYMBOLS.meta
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
            s += keyboard.keyCode_to_chr(keyCode)
    if shortcut.twice
        s = s + ',' + s
    return s

exports.KeyboardShortcut = KeyboardShortcut = rclass
    propTypes :
        shortcut : rtypes.object.isRequired

    render: ->
        <span style={fontFamily:'monospace'}>
            {shortcut_to_string(@props.shortcut)}
        </span>

SHORTCUTS_STYLE =
    width        : '20em'
    overflowX    : 'hidden'
    border       : '1px solid transparent'
    paddingRight : '10px'

Shortcuts = rclass
    propTypes :
        actions   : rtypes.object.isRequired
        name      : rtypes.string.isRequired
        shortcuts : rtypes.array.isRequired
        taken     : rtypes.object.isRequired

    getInitialState: ->
        hover : false
        add   : false
        value : ''
        taken : false
        shortcut : undefined

    edit_shortcut: (e) ->
        e.stopPropagation()

    delete_shortcut: (shortcut) ->
        @props.actions.delete_keyboard_shortcut(@props.name, shortcut)

    render_shortcuts: ->
        for key, shortcut of @props.shortcuts
            @render_shortcut(key, shortcut)

    render_shortcut_delete_icon: ->
        <Icon
            onClick = {(e) => e.stopPropagation(); @delete_shortcut(shortcut)}
            name    = 'times'
            style   = {color: '#888', paddingLeft: '1ex'}
            />

    render_shortcut: (key, shortcut) ->
        <span
            key     = {key}
            style   = {border: '1px solid #999', margin: '2px', padding: '1px'}>
            <KeyboardShortcut
                key      = {key}
                shortcut = {shortcut}
            />
            {### @render_shortcut_delete_icon() # disabled for now ###}
        </span>

    cancel_edit: ->
        @setState(add: false, taken:false, value:'', shortcut:undefined)

    confirm_edit: ->
        @props.actions.add_keyboard_shortcut(@props.name, @state.shortcut)
        @setState(add: false, taken:false, value:'', shortcut:undefined)

    key_down: (e) ->
        if not e.shiftKey and not e.altKey and not e.metaKey and not e.ctrlKey
            if e.which == 27
                @cancel_edit()
                return
        shortcut = keyboard.evt_to_obj(e, 'escape')
        # Is this shortcut already taken, either in escape mode or both modes.
        taken = @props.taken[json(keyboard.evt_to_obj(e))] ? @props.taken[json(shortcut)]
        @setState
            value    : shortcut_to_string(shortcut)
            shortcut : shortcut
            taken    : taken

    render_edit_shortcut: ->
        if @state.taken
            bg    = 'red'
            color = 'white'
        else
            bg    = 'white'
            color = 'black'
        <input
            style       = {width:'3em', backgroundColor:bg, color:color}
            autoFocus   = {true}
            ref         = 'input'
            type        = 'text'
            value       = {@state.value}
            onKeyDown   = {@key_down}
        />


    render_cancel_edit_shortcut: ->
        <Icon
            onClick = {(e) => e.stopPropagation(); @cancel_edit()}
            name    = 'times'
            style   = {color: '#888', paddingLeft: '1ex'}
        />

    render_confirm_edit_shortcut: ->
        <Icon
            onClick = {(e) => e.stopPropagation(); @confirm_edit()}
            name    = 'check'
            style   = {color: '#888', paddingLeft: '1ex'}
        />

    render_taken_note: ->
        <span style={backgroundColor:'#fff'}>
            <br/>
            Shortcut already used by '{@state.taken}'
        </span>

    render: ->
        hover = @state.hover
        hover = false # editing shortcuts disabled until #v2
        <div className    = 'pull-right'
              style        = {SHORTCUTS_STYLE}
              onClick      = {@edit_shortcut}
              onMouseEnter = {=>@setState(hover:true)}
              onMouseLeave = {=>@setState(hover:false)}
              >
            {@render_shortcuts()}
            {@render_edit_shortcut() if hover}
            {@render_cancel_edit_shortcut() if hover}
            {@render_confirm_edit_shortcut() if @state.value and not @state.taken and hover}
            {@render_taken_note() if @state.taken and hover}
        </div>


capitalize = (s) ->
    return (misc.capitalize(x) for x in misc.split(s)).join(' ')

COMMAND_STYLE =
    cursor       : 'pointer'
    borderTop    : '1px solid #ccc'
    padding      : '5px 0 5px 10px'
    height       : '2em'

Command = rclass
    propTypes :
        actions   : rtypes.object.isRequired
        name      : rtypes.string.isRequired
        desc      : rtypes.string.isRequired
        icon      : rtypes.string
        shortcuts : rtypes.array.isRequired
        taken     : rtypes.object.isRequired

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
            name      = {@props.name}
            taken     = {@props.taken} />

    render: ->
        if @state.highlight
            style = misc.merge_copy(COMMAND_STYLE, {backgroundColor:'#ddd'})
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
        actions : rtypes.object.isRequired
        taken   : rtypes.object.isRequired
        search  : rtypes.string

    shouldComponentUpdate: (next) ->
        return next.search != @props.search

    render_commands: ->
        v = []
        for name, val of commands.commands()
            if val?
                v.push(name:name, val:val)
        v.sort(misc.field_cmp('name'))
        cmds = []
        search = @props.search?.toLowerCase() ? ''
        for x in v
            if not x.val.f?
                continue
            desc = x.val.m ? capitalize(x.name)
            if not desc?
                continue
            if desc.toLowerCase().indexOf(search) == -1
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
                taken     = {@props.taken}
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
        obj =
            search   : ''
            commands : commands.commands()
        obj.taken = {}
        for name, val of obj.commands
            for s in val?.k ? []
                obj.taken[json(s)] = val.m ? name
        return obj

    close: ->
        @props.actions.close_keyboard_shortcuts()
        @props.actions.focus(true)

    search_change: (search) ->
        @setState(search: search)

    render_instructions: ->
        <div style={color:'#666', marginBottom:'10px'}>
            Click a command to perform it.
            <br/>
            NOTE: Keyboard shortcuts are not customizable yet.
            {### To add a keyboard shortcut, click plus next to the key combination then type the new keys. ###}
        </div>

    render: ->
        <Modal show={@props.keyboard_shortcuts?.get('show')} onHide={@close} bsSize="large" >
            <Modal.Header closeButton>
                <Modal.Title><Icon name='keyboard-o'/> Commands and keyboard shortcuts</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <SearchInput
                    autoFocus  = {true}
                    value      = {@state.search}
                    on_change  = {@search_change} />
                {@render_instructions()}
                <CommandList
                    actions  = {@props.actions}
                    taken    = {@state.taken}
                    search   = {@state.search} />
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>


