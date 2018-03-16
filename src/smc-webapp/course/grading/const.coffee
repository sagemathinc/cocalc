##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2018, Sagemath Inc.
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

{COLORS} = require('smc-util/theme')

# shared configuration constants

# for the files listing
exports.PAGE_SIZE = 10

exports.MAXPOINTS = 1000000

# styles

exports.ROW_STYLE =
    marginBottom: '10px'

exports.LIST_STYLE =
    borderRadius  : '5px'
    marginBottom  : '0px'

exports.LIST_ENTRY_STYLE =
    border         : '0'
    borderBottom   : "1px solid #{COLORS.GRAY_LLL}"
    overflow       : 'hidden'
    whiteSpace     : 'nowrap'

exports.FLEX_LIST_CONTAINER =
    display        : 'flex'
    flexDirection  : 'column'
    overflowY      : 'auto'
    border         : "1px solid #{COLORS.GRAY_L}"
    borderRadius   : '5px'
    flexGrow       : '1'

exports.EMPTY_LISTING_TEXT =
    fontSize       : '120%'
    textAlign      : 'center'
    minHeight      : '15vh'
    display        : 'flex'
    alignItems     : 'center'
    justifyContent : 'center'

exports.GRADE_COMMENT_STYLE =
    maxHeight:'5rem'
    overflowY:'auto'
    padding:'5px'
    border: "1px solid #{COLORS.GRAY_L}"

