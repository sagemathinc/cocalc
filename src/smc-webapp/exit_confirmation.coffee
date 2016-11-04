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
#
# This should be a confirmation-before-leave dialog.  So far, this
# code works in Firefox, Chrome, Safari, Opera and IE11
#
# Also, this does not work on iOS.
#
###
#{unsynced_docs} = require('./syncdoc')

{redux} = require('./smc-react')

window.onbeforeunload = (e) ->
    if redux.getStore('account').get_confirm_close()
        mesg = ""
    else
        mesg = undefined
    if mesg?
        e.cancelBubble = true  # e.cancelBubble is supported by IE - this will kill the bubbling process.
        e.returnValue = mesg
        if e.stopPropagation
            e.stopPropagation()
            e.preventDefault()
    return mesg
