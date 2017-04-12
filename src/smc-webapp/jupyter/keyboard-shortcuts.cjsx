"""
The keyboard shortcuts and command listing dialog, which:

  - lets you search through all available commands
  - see and change the keyboard shortcuts for those commands
"""

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Button, Modal} = require('react-bootstrap')

exports.KeyboardShortcuts = rclass
    propTypes :
        actions            : rtypes.object.isRequired
        keyboard_shortcuts : rtypes.immutable.Map

    close: ->
        @props.actions.close_keyboard_shortcuts()
        @props.actions.focus()

    render: ->
        <Modal show={@props.keyboard_shortcuts?.get('show')} bsSize="large" onHide={@close} >
            <Modal.Header closeButton>
                <Modal.Title>Jupyter Notebook Commands and Keyboard Shortcuts</Modal.Title>
            </Modal.Header>
            <Modal.Body>

            </Modal.Body>

            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>

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

exports.KeyboardShortcut = rclass
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





