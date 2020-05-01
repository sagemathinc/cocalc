#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Test the OutputHandler object.
###

expect  = require('expect')

misc = require('smc-util/misc')

immutable = require('immutable')

{OutputHandler} = require('../output-handler')

describe 'very basic tests -- ', ->
    it 'first very basic test', ->
        cell = {}
        handler = new OutputHandler(cell:cell)
        handler.start()
        expect(misc.copy_without(cell,'start')).toEqual({state: 'busy', end: null, exec_count: null, output: null })
        expect(Math.abs(new Date() - cell.start) < 10).toBe(true)
        handler.done()
        expect(cell.state).toBe('done')
        expect(Math.abs(new Date() - cell.end) < 10).toBe(true)

describe 'test the the error method -- ', ->
    it 'basic test', ->
        cell = {}
        handler = new OutputHandler(cell:cell)
        handler.error("an error")
        expect(misc.copy_without(cell,['end','start'])).toEqual(exec_count: null, output: { 0: { name: 'stderr', text: 'an error' } }, state: 'done')
        expect(cell.start? and cell.end?).toBe(true)

describe 'clearing output -- ', ->
    it 'with no messages', ->
        cell = {}
        handler = new OutputHandler(cell:cell)
        handler.clear()
        expect(cell.output).toEqual(null)

    it 'with the default (no wait) argument and only one output message', ->
        cell = {}
        handler = new OutputHandler(cell:cell)
        handler.message({name:'stdout', text:'cocalc'})
        expect(cell.output).toEqual({ 0: { name: 'stdout', text: 'cocalc' } })
        handler.clear()
        expect(cell.output).toEqual(null)

    it 'with multiple outputs', ->
        cell = {}
        handler = new OutputHandler(cell:cell)
        handler.message({name:'stdout', text:'cocalc1'})
        handler.message({name:'stdout', text:'cocalc2'})
        expect(cell.output).toEqual({ 0: { name: 'stdout', text: 'cocalc1' }, 1: { name: 'stdout', text: 'cocalc2' } })
        handler.clear()
        expect(cell.output).toEqual(null)


describe 'clearing output -- with the non-default wait argument', ->
    cell = {}
    handler = new OutputHandler(cell:cell)

    it 'does clear with true and sees that nothing changes', ->
        handler.message({name:'stdout', text:'cocalc'})
        expect(cell.output).toEqual({ 0: { name: 'stdout', text: 'cocalc' } })
        handler.clear(true)  # wait true
        expect(cell.output).toEqual({ 0: { name: 'stdout', text: 'cocalc' } })

    it 'puts another message in and sees that it replaces last', ->
        handler.message({name:'stdout', text:'CoCalC'})
        expect(cell.output).toEqual({ 0: { name: 'stdout', text: 'CoCalC' } })

describe 'verify that events are emitted in several cases', ->
    it 'does a very basic test', ->
        cell = {}
        handler = new OutputHandler(cell:cell)
        handler.once 'change', (save) ->
            expect(cell.output).toEqual({ 0: { name: 'stdout', text: 'cocalc' } })
            expect(save).toEqual(true)
        handler.message({name:'stdout', text:'cocalc'})

    it 'tests the done event', (done) ->
        handler = new OutputHandler(cell:{})
        handler.once 'done', done
        handler.done()

    it 'tests the more_output event', (done) ->
        handler = new OutputHandler(cell:{}, max_output_length:30)
        m = { name: 'stdout', text: 'CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC ' }
        handler.once 'more_output', (mesg, mesg_length) ->
            expect(mesg).toEqual(m)
            expect(mesg_length).toBe(JSON.stringify(m).length)
            done()
        handler.message(m)

    it 'tests the process event', (done) ->
        handler = new OutputHandler(cell:{})
        m = { name: 'stdout', text: 'CoCalC' }
        handler.once 'process', (mesg) ->
            expect(mesg).toEqual(m)
            done()
        handler.message(m)

    it 'uses the process event to modify a message before it hits more_output', (done) ->
        handler = new OutputHandler(cell:{}, max_output_length:30)
        m = { name: 'stdout', text: 'CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC CoCalC ' }
        handler.once 'process', (mesg) ->
            mesg.text = 'cocalc'
        handler.once 'more_output', (mesg, mesg_length) ->
            expect(mesg).toEqual({ name: 'stdout', text: 'cocalc'})
            expect(mesg_length).toBe(33)
            done()
        handler.message(m)

describe 'stdin interactive input -- ', ->
    it 'non-password input', (done) ->
        cell = {}
        handler = new OutputHandler(cell:cell)
        handler.stdin {password:false, prompt:'a?'}, (err, value) ->
            expect(value).toBe('cocalc')
            expect(cell.output['0'].value).toBe('cocalc')
            done(err)
        expect(cell).toEqual({ end: null, exec_count: null, output: { 0: { name: 'input', opts: { password: false, prompt: 'a?' } } }, start: null, state: 'run' })
        # now give it response
        c = misc.deep_copy(cell)
        c.output['0'].value = 'cocalc'
        handler.cell_changed(immutable.fromJS(c))

    it 'password input', (done) ->
        cell = {}
        handler = new OutputHandler(cell:cell)
        handler.stdin {password:true, prompt:'a?'}, (err, value) ->
            expect(value).toBe('cocalc')
            expect(cell.output['0'].value).toBe('xxxxxx')
            done(err)
        expect(cell).toEqual({ end: null, exec_count: null, output: { 0: { name: 'input', opts: { password: true, prompt: 'a?' } } }, start: null, state: 'run' })
        # now give it response
        c = misc.deep_copy(cell)
        c.output['0'].value = 'xxxxxx'
        get_password = ->
            return 'cocalc'
        handler.cell_changed(immutable.fromJS(c), get_password)



