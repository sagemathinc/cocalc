###
Supplies the interface for creating file editors in the webapp

---

 CoCalc: Collaborative Calculation in the Cloud

    Copyright (C) 2016, SageMath, Inc.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of

    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

###

{file_associations} = require('./file-associations')

# I factored out the pure javascript code that doesnt require a bunch of very frontend-ish stuff
# here, but still want this file to provide these as exports, so I don't have to change code
# all over the place:
file_editors = require('./file-editors')
for n in ['icon', 'register_file_editor', 'initialize', 'generate', 'remove', 'save']
    exports[n] = file_editors[n]

exports.special_filenames_with_no_extension = ->
    return (name.slice(6) for name in Object.keys(file_associations) when name.slice(0,6) == 'noext-')

require('./register-editors')