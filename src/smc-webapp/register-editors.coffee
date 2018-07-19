###
Register all the editors.

One you add a new built in editor, it should go here.
###

# Require each module, which loads a file editor.  These call register_file_editor.
# This should be a comprehensive list of all React editors

# require('./editor_terminal')
require('./chat/register')
require('./editor_archive')
#require('./course/main')
require('./course-coffee/main')
require('./editor_pdf')
require('./stopwatch/register')
require('./jupyter/register')
require('./tasks/register')

require('./media-viewer/register')

# Public editors
#require('./public/editor_image')

# Raw data editors
require('./editor-data/generic')

# All the non-react editors.
require('./editor').register_nonreact_editors()

require('./frame-editors/register')

