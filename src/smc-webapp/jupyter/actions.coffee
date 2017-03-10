###
Jupyter client

The goal here is to make a simple proof of concept editor for working with
Jupyter notebooks.  The goals are:
 1. to **look** like the normal jupyter notebook
 2. work like the normal jupyter notebook
 3. work perfectly regarding realtime sync and history browsing

###

immutable = require('immutable')

{React, ReactDOM, Redux, Actions, Store}  = require('../smc-react')

###
The actions -- what you can do with a jupyter notebook, and also the
underlying synchronized state.
###

class exports.JupyterActions extends Actions

    _init: () =>
        @setState
            error  : undefined
            cur_id : undefined
            mode   : 'escape'


    set_error: (err) =>
        @setState
            error : err

    set_cell_input: (id, value) =>
        # TODO: insanely stupid/slow -- just for proof of concept
        @syncdb.set
            type  : 'cell'
            id    : id
            input : value

    set_cur_id: (id) =>
        @setState(cur_id : id)

    set_mode: (mode) =>
        @setState(mode: mode)

    _syncdb_change: =>
        # TODO: this is horrendously not efficient!
        cells = @syncdb.get(type:'cell')
        # Sort and ensure at least one cell

        @setState
            cells  : cells
            kernel : @syncdb.get_one(type:'settings')?.get('kernel')

        # cells.sort...
        cur_id = @store.get('cur_id')
        if not cur_id? # todo: or the cell doesn't exist
            @set_cur_id(cells.get(0)?.get('id'))

    _set: (obj) =>
        @syncdb.set(obj)
        @syncdb.save()  # save to file on disk
