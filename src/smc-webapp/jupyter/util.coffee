###
Some simple misc functions with no dependencies.

It's very good to have these as functions rather than put
the code all over the place and have conventions about paths!

part of CoCalc
(c) SageMath, Inc., 2017
###

immutable = require('immutable')

misc = require('smc-util/misc')

# Given an immutable Map from id's to cells, returns an immutable List whose
# entries are the id's in the correct order, as defined by the pos field (a float).
exports.sorted_cell_list = (cells) ->
    if not cells?
        return
    # TODO: rewrite staying immutable
    v = []
    cells.forEach (record, id) ->
        v.push({id:id, pos:record.get('pos')})
        return
    v.sort (a,b) ->
        misc.cmp(a.pos, b.pos)
    v = (x.id for x in v)
    return immutable.List(v)
