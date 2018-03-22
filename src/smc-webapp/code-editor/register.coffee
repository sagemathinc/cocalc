###
Register the code editor
###

{file_associations}    = require('../file-associations')

{Editor}               = require('./editor')
{Actions}              = require('./actions')

{register_file_editor} = require('./register-generic')

register_file_editor
    ext       : (key for key, value of file_associations when value.editor == 'codemirror')
    component : Editor
    Actions   : Actions