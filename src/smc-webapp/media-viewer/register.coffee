###
Handle viewing images and videos
###

{MediaViewer}            = require('./viewer')
{register_file_editor}   = require('../project_file')
{IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS} = require('../file-associations')

for is_public in [true, false]
    register_file_editor
        ext       : IMAGE_EXTS
        icon      : 'file-image-o'
        component : MediaViewer
        is_public : is_public

    register_file_editor
        ext       : VIDEO_EXTS
        icon      : 'file-video-o'
        component : MediaViewer
        is_public : is_public

    register_file_editor
        ext       : AUDIO_EXTS
        icon      : 'file-audio-o'
        component : MediaViewer
        is_public : is_public


