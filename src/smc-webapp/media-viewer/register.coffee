###
Handle viewing images and videos
###

{MediaViewer}            = require('./viewer')
{register_file_editor}   = require('../project_file')
{IMAGE_EXTS, VIDEO_EXTS} = require('../file-associations')

register_file_editor
    ext       : IMAGE_EXTS
    icon      : 'file-image-o'
    component : MediaViewer

register_file_editor
    ext       : VIDEO_EXTS
    icon      : 'file-video-o'
    component : MediaViewer

