###
Some simple misc functions with no dependencies.

It's very good to have these as functions rather than put
the code all over the place and have conventions about paths!

part of CoCalc
(c) SageMath, Inc., 2017
###



# This list is inspired by OutputArea.output_types in https://github.com/jupyter/notebook/blob/master/notebook/static/notebook/js/outputarea.js
# The order matters -- we only keep the left-most type (see import-from-ipynb.coffee)

exports.JUPYTER_MIMETYPES = ['application/javascript', 'text/html', 'text/markdown', 'text/latex', \
                             'image/svg+xml', 'image/png', 'image/jpeg', 'application/pdf', 'text/plain']

