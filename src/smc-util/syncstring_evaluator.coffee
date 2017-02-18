###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

###
Evaluation of code with streaming output built on both the clients and
server (local hub) using a sync_table.  This evaluator is associated
to a syncstring editing session, and provides code evaluation that
may be used to enhance the experience of document editing.
###

async     = require('async')
stringify = require('json-stable-stringify')

sagews    = require('./sagews')
misc      = require('./misc')

{defaults, required} = misc

class exports.Evaluator
    constructor: (@string, cb) ->
        @_init_sync_tables (err) =>
            if err
                cb?(err)
            else
                if @string._client.is_project()
                    @_init_project_evaluator()
                cb?()

    _init_sync_tables: (cb) =>
        async.parallel([@_init_eval_inputs, @_init_eval_outputs], (err) => cb(err))

    _init_eval_inputs: (cb) =>
        query =
            eval_inputs :
                string_id : @string._string_id
                time      : {'>=': misc.server_seconds_ago(30)}
                input     : null
        @_inputs = @string._client.sync_table(query, undefined, 500)
        @_inputs.once('connected', =>cb())

    _init_eval_outputs: (cb) =>
        query =
            eval_outputs :
                string_id : @string._string_id
                time      : {'>=': misc.server_seconds_ago(30)}
                output    : null
        @_outputs = @string._client.sync_table(query, undefined, 500)
        @_outputs.setMaxListeners(100)  # in case of many evaluations at once.
        @_outputs.once('connected', =>cb())

    close: () =>
        @_closed = true
        @_inputs?.close()
        delete @_inputs
        @_outputs?.close()
        delete @_outputs
        @_sage_session?.close()
        delete @_sage_session

    call: (opts) =>
        opts = defaults opts,
            program : required    # 'sage', 'bash'
            input   : required    # object whose meaning depends on the program
            cb      : undefined
        if @_closed
            opts.cb?("closed")
            return
        time = @string._client.server_time()
        # Perturb time if it is <= last time when this client did an evaluation.
        # We do this so that the time below is different than anything else.
        # TODO: This is NOT 100% yet, due to multiple clients possibly starting
        # different evaluations simultaneously.
        if @_last_time? and time <= @_last_time
            time = new Date(@_last_time - 0 + 1)  # one millesecond later
        @_last_time = time

        @_inputs.set
            string_id : @string._string_id
            time      : time
            user_id   : 0
            input     : misc.copy_without(opts, 'cb')
        @_inputs.save()  # root cause of https://github.com/sagemathinc/smc/issues/1589
        if opts.cb?
            # Listen for output until we receive a message with mesg.done true.
            messages = {}
            mesg_number = 0
            send = (mesg) =>
                if mesg.done
                    @_outputs.removeListener('change', handle_output)
                opts.cb?(mesg)

            handle_output = (keys) =>
                #console.log("handle_output #{misc.to_json(keys)}")
                if @_closed
                    opts.cb?("closed")
                    return
                for key in keys
                    t = misc.from_json(key)
                    if t[1] - time == 0  # we called opts.cb on output with the given timestamp
                        mesg = @_outputs.get(key)?.get('output')?.toJS()
                        if mesg?
                            delete mesg.id # waste of space
                            # This code is written under the assumption that messages may
                            # arrive in somewhat random order.  We did this since RethinkDB
                            # doesn't guarantee anything about the order of writes versus
                            # when changes get pushed out.  That said, PostgreSQL **does** make
                            # clear guarantees about when things happen, so this may
                            # no longer be a problem.... (TODO).
                            # E.g. this in a Sage worksheet:
                            #    for i in range(20): print i; sys.stdout.flush()
                            if t[2] == mesg_number     # t[2] is the sequence number of the message
                                # Inform caller of result
                                send(mesg)
                                # Push out any messages that arrived earlier that are ready to send.
                                mesg_number += 1
                                while messages[mesg_number]?
                                    send(messages[mesg_number])
                                    delete messages[mesg_number]
                                    mesg_number += 1
                            else
                                # Put message in the queue of messages that arrived too early
                                messages[t[2]] = mesg

            @_outputs.on('change', handle_output)

    _execute_code_hook: (output_uuid) =>
        dbg = @string._client.dbg("_execute_code_hook('#{output_uuid}')")
        dbg()
        if @_closed
            dbg("closed")
            return

        output_line = sagews.MARKERS.output
        process = (mesg) =>
            dbg("processing mesg '#{misc.to_json(mesg)}'")
            content = @string.get()
            i = content.indexOf(sagews.MARKERS.output + output_uuid)
            if i == -1
                # no cell anymore -- do nothing further
                process = undefined
                return
            i += 37
            n = content.indexOf('\n', i)
            if n == -1   # corrupted
                return
            output_line += stringify(misc.copy_without(mesg, ['id', 'event'])) + sagews.MARKERS.output
            #dbg("sage_execute_code: i=#{i}, n=#{n}, output_line.length=#{output_line.length}, output_line='#{output_line}'")
            if output_line.length > n - i
                dbg("sage_execute_code: initiating client didn't maintain sync promptly. fixing")
                x = content.slice(0, i)
                content = x + output_line + content.slice(n)
                if mesg.done
                    j = x.lastIndexOf(sagews.MARKERS.cell)
                    if j != -1
                        j = x.lastIndexOf('\n', j)
                        cell_id = x.slice(j+2, j+38)
                        #dbg("removing a cell flag: before='#{content}', cell_id='#{cell_id}'")
                        S = sagews.sagews(content)
                        S.remove_cell_flag(cell_id, sagews.FLAGS.running)
                        S.set_cell_flag(cell_id, sagews.FLAGS.this_session)
                        content = S.content
                        #dbg("removing a cell flag: after='#{content}'")
                @string.set(content)
                @string.save()

        hook = (mesg) =>
            setTimeout((=>process?(mesg)), 5000)
        return hook

    _handle_input_change: (key) =>
        dbg = @string._client.dbg('_handle_input_change')
        dbg("change: #{key}")
        if @_closed
            dbg("closed")
            return
        t = misc.from_json(key)
        id = [string_id, time, number] = [t[0], t[1], 0]
        if not @_outputs.get(JSON.stringify(id))?
            dbg("no outputs with key #{misc.to_json(id)}")
            x = @_inputs.get(key)?.get('input')?.toJS?()  # could be deleting a key!
            if not x?
                return
            if x.program? and x.input?
                f = @["_evaluate_using_#{x.program}"]
                if f?
                    if x.input.event == 'execute_code' and x.input.output_uuid?
                        hook = @_execute_code_hook(x.input.output_uuid)
                    f x.input, (output) =>
                        if @_closed
                            return
                        #dbg("got output='#{misc.to_json(output)}'; id=#{misc.to_json(id)}")
                        hook?(output)
                        @_outputs.set({string_id:string_id, time:time, number:number, output:output})
                        @_outputs.save()
                        number += 1
                else
                    @_outputs.set({string_id:string_id, time:time, number:number, output:misc.to_json({error:"no program '#{x.program}'", done:true})})
                    @_outputs.save()
            else
                @_outputs.set({string_id:string_id, time:time, number:number, output:misc.to_json({error:"must specify program and input", done:true})})
                @_outputs.save()

    # Runs only in the project
    _init_project_evaluator: () =>
        dbg = @string._client.dbg('project_evaluator')
        dbg('init')
        @_inputs.on 'change', (keys) =>
            for key in keys
                @_handle_input_change(key)

    # Runs only in the project
    _evaluate_using_sage: (input, cb) =>
        @_sage_session ?= @string._client.sage_session(path : @string._path)
        # TODO: input also may have -- uuid, output_uuid, timeout
        if input.event == 'execute_code'
            input = misc.copy_with(input, ['code', 'data', 'preparse', 'event', 'id'])
        @_sage_session.call
            input : input
            cb    : cb

    # Runs only in the project
    _evaluate_using_shell: (input, cb) =>
        input.cb = (err, output) =>
            if not output?
                output = {}
            if err
                output.error = err
            output.done = true
            cb(output)
        @string._client.shell(input)
