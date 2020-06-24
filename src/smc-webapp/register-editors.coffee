#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Register all the editors.

One you add a new built in editor, it should go here.
###

# Require each module, which loads a file editor.  These call register_file_editor.
# This should be a comprehensive list of all React editors


require('./chat/register')
require('./editors/archive/actions')
require('./stopwatch/register')

#require('./jupyter/register')
# public read-only jupyter view:
{ webapp_client } = require("./webapp_client");
require("./jupyter/nbviewer/register").register(webapp_client)

require('./tasks/register')

require('./editors/media-viewer/register')

# Public editors
#require('./public/editor_image')

# Raw data editors
require('./editor-data/generic')

# All the non-react editors.
require('./editor').register_nonreact_editors()

require('./frame-editors/register')

