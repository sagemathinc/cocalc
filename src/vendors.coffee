window.smcLoadStatus("Loading core JavaScript Libraries")

libs = [
    'react'
    'async'
    'events'
    'marked'
    'redux'
    'react-redux'
    'react-timeago'
    'react-bootstrap'
    'sha1'
    'underscore'
    'immutable'
    'react-dropzone-component'
    'jquery.payment'
    'react-widgets/lib/Combobox'
    'react-widgets/lib/DateTimePicker'
    'md5'
    './smc-webapp/codemirror/codemirror.coffee'
]

for lib in libs
    require(lib)