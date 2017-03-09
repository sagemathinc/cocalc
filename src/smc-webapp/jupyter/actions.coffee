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

    set_error: (err) =>
        @setState
            error : err

    set_cell_input: (id, value) =>
        # TODO: insanely stupid/slow -- just for proof of concept
        @syncdb.set
            type  : 'cell'
            id    : id
            input : value

    _syncdb_change: =>
        # TODO: this is not efficient!
        @setState
            cells : @syncdb.get(type:'cell')
            title : @syncdb.get_one(type:'settings')?.get('title')

    _set: (obj) =>
        @syncdb.set(obj)
        @syncdb.save()  # save to file on disk
