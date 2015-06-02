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

class AppFlux extends Flux
    constructor: () ->
        super()

flux = new AppFlux()

exports.React         = React = require('react')
exports.FluxComponent = require('flummox/component')
exports.flux          = flux
exports.rtypes        = React.PropTypes
exports.rclass        = React.createClass
exports.Actions       = Actions
exports.Store         = Store



