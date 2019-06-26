###
Take a sagews file and produce a structured object representation of it.

Why?

- This will be used for our public share server, to have a more sane input to a renderer.
- This will be used for a syncdb based version of sage worksheets, someday.

How to try this on a file in a terminal:

coffee> p = require('./parse-sagews').parse_sagews
coffee> obj = p(fs.readFileSync('/home/user/tmp/2017-11-17-004119.sagews').toString())
[ { type: 'cell',
    pos: 0,
    id: '2333fcde-e0e1-48de-95ae-2989833f2e4d',
    flags: 'i',
    output: { '0': [Object] },
    input: '%md\n# foo\n- bar' },
  { type: 'cell',
    pos: 1,
    id: 'dc146b74-6bbc-4c45-b9a9-5e9cd916bc8c',
    flags: 'so',
    output: { '0': [Object], '1': [Object] },
    input: '2+3' },
  { type: 'cell',
    pos: 2,
    id: 'b10defe5-2bb5-4df3-bd92-1aed34389079',
    flags: 's',
    output: { '0': [Object], '1': [Object] },
    input: 'plot(sin)' },
...
###

{MARKERS, FLAGS, ACTION_FLAGS, ACTION_SESSION_FLAGS} = require('smc-util/sagews')

# Input: a string that is the contents of a .sagews file
# Output: a list of objects
#   [{type:'cell', pos:0, id:'...', flags:'...', input:'...', output:{0:mesg, 1:mesg, ...}}]

exports.parse_sagews = (sagews) ->
    obj = []
    pos = 0
    i   = 0
    while true
        meta_start = sagews.indexOf(MARKERS.cell, i)
        if meta_start == -1
            break
        meta_end = sagews.indexOf(MARKERS.cell, meta_start+1)
        if meta_end == -1
            break
        id = sagews.slice(meta_start+1, meta_start+1+36)
        flags = sagews.slice(meta_start+1+36, meta_end)
        output_start = sagews.indexOf(MARKERS.output, meta_end+2)
        if output_start == -1
            output_start = sagews.length
            output_end = sagews.length
        else
            n = sagews.indexOf(MARKERS.cell, output_start+1)
            if n == -1
                output_end = sagews.length
            else
                output_end = n - 1
        input  = sagews.slice(meta_end+2, output_start-1)
        n = 0
        output = {}
        for s in sagews.slice(output_start + 38, output_end).split(MARKERS.output)
            if not s
                continue
            try
                mesg = JSON.parse(s)
                output["#{n}"] = mesg
                n += 1
            catch err
                console.warn("exception parsing '#{s}'; ignoring -- #{err}")
        cell =
            type   : 'cell'
            pos    : pos
            id     : id
        if flags
            cell.flags = flags
        if n > 0
            cell.output = output
        if input
            cell.input = input
        obj.push(cell)
        pos += 1
        i = output_end + 1
    if pos == 0 and sagews.trim().length > 0
        # special case -- no defined cells, e.g., just code that hasn't been run
        cell =
            type   : 'cell'
            pos    : 0
            id     : ''
            input  : sagews
        obj.push(cell)
    return obj