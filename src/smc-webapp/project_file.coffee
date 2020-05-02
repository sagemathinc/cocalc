#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# Supplies the interface for creating file editors in the webapp

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