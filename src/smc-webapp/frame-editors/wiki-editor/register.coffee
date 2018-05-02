###
Register the Wiki editor
###

{Editor}               = require('./editor')
{Actions}              = require('./actions')

{register_file_editor} = require('../code-editor/register-generic')

register_file_editor
    ext       : ['wiki', 'mediawiki']
    component : Editor
    Actions   : Actions