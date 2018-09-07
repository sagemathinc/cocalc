##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2018, SageMath, Inc.
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

# used elsewhere, to make sure we use the same iconography everywhere
exports.ICON_NAME = 'magic'

exports.REPO_URL = 'https://github.com/sagemathinc/cocalc-assistant'

# Redux stuff

exports.INIT_STATE =
    category0           : null # idx integer
    category1           : null # idx integer
    category2           : null # idx integer
    category_list0      : []
    category_list1      : []
    category_list2      : []
    code                : undefined
    setup_code          : undefined
    descr               : undefined
    hits                : []
    search_str          : null
    search_sel          : null
    submittable         : false
    category1_top       : ["Introduction", "Tutorial", "Help"]
    unknown_lang        : false
