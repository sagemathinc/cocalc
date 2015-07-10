###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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

{Actions, Store, Flux} = require('flummox')

# TABLE class -- this is our addition to connect the Flux framework to our backend.
# To create a new Table, create a class that derives from Table.  Optionally,
# implement an _change method, which will be called when the Table changes.
# Typically the table will fire off Flux actions from within this method.
# There is a set method below, but *no* exposed get method, since the flow
# of data shoudl be into the Table, then out to the stores via actions
# (and also back and forth with the backend server).   Do not get at the
# underlying Table directly in code.
class Table
    constructor: ->
        if not Primus?  # hack for now -- not running in browser (instead in testing server)
            return
        @_table = require('salvus_client').salvus_client.sync_table(@query(), @options())
        if @_change?
            @_table.on 'change', (keys) =>
                @_change(@_table, keys)

    set: (obj) =>
        @_table.set(obj)

    options: =>  # override in derived class to pass in options to the query -- these only impact initial query, not changefeed!


    # NOTE: it is intentional that there is no get method.  Instead, get data
    # from stores.  The table will set stores as needed when it changes.


class AppFlux extends Flux
    constructor: () ->
        @_tables = {}
        super()

    createActions: (name, cls) =>
        A = super(name, cls)
        A.flux = @
        return A

    createTable: (name, table_class) =>
        tables = @_tables
        if tables[name]?
            throw "createTable: table #{name} already exists"
        if not table_class?
            throw "createTable: second argument must be a class that extends Table"
        table = new table_class()
        if not table instanceof Table
            throw "createTable: takes a name and Table class (not object)"
        table.flux = @
        tables[name] = table

    removeTable: (name) =>
        if @_tables[name]?
            @_tables[name]._table.close()
            delete @_tables[name]

    getTable: (name) =>
        if not @_tables[name]?
            throw "getTable: table #{name} not registered"
        return @_tables[name]

    getProjectStore: (project_id) =>
        return require('project_store').getStore(project_id, @)

    getProjectActions: (project_id) =>
        return require('project_store').getActions(project_id, @)

    getProjectTable: (project_id, name) =>
        return require('project_store').getTable(project_id, name, @)


flux = new AppFlux()

exports.React         = React = require('react')
exports.FluxComponent = require('flummox/component')
exports.flux          = flux
exports.rtypes        = React.PropTypes
exports.rclass        = React.createClass
exports.Actions       = Actions
exports.Table         = Table
exports.Store         = Store



