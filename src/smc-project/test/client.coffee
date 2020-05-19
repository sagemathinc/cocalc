#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

expect  = require('expect')

{Client} = require('../client')

async = require('async')

PATH = '.file'  # TODO: very sloppy choice

describe 'reading and writing to a file', ->
    C = new Client()
    it 'writes to a file', (done) ->
        C.write_file
            path : PATH
            data : 'stuff'
            cb   : done

    it 'reads from the file', (done) ->
        C.path_read
            path : PATH
            cb   : (err, content) ->
                if err
                    done(err)
                else
                    expect(content.toString()).toBe('stuff')
                    done()

    it 'writes to a file twice at the same time', (done) ->
        async.parallel([
            (cb) ->
                C.write_file
                    path : PATH
                    data : 'stuff1'
                    cb   : cb
            (cb) ->
                C.write_file
                    path : PATH
                    data : 'stuff2'
                    cb   : cb
        ], done)

    it 'reads from the twice at the same time', (done) ->
        async.parallel([
            (cb) ->
                C.path_read
                    path : PATH
                    cb   : cb
            (cb) ->
                C.path_read
                    path : PATH
                    cb   : cb
        ], (err, content) ->
                if err
                    done(err)
                else
                    expect(content.toString().slice(0,5)).toBe('stuff')
                    done()
        )






