###
Handle images and videos

 - image types -- see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img
 - video types --


###

{ImageViewer} = require('./image')
{register_file_editor} = require('../project_file')

register_file_editor
    ext       : ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'apng', 'svg', 'ico']
    icon      : 'file-image-o'
    component : ImageViewer

