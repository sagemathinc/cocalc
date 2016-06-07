###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, John Jeng
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

{React, rtypes, rclass}  = require('./smc-react')
{Button, Alert} = require('react-bootstrap')

exports.DeletedAccountWarning = rclass
    displayName : 'Deleted-Account-Warning'

    propTypes:
        undelete_account : rtypes.func.isRequired

    render: ->
        <div style={textAlign:'center', fontSize:'200%'}>
            <Alert bsStyle='danger' style={margin:'10px'}>
                Your account is about to be deleted.<br/>
                If you did this by mistake, you have 24 hours to reverse this action.
            </Alert>
            <Button
                bsStyle='primary'
                bsSize='large'
                onClick={@props.undelete_account}
                style={fontWeight:'bold'}
            >
                Get my account back!
            </Button>
        </div>