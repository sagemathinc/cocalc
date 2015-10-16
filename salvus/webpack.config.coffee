###
Webpack configuration file

Run dev server with source maps:

    npm run webpack-watch

Then visit (say)

    https://dev0.sagemath.com/static/webpack.html

This is far from ready to use yet, e.g., we need to properly serve primus websockets, etc.:

    webpack-dev-server --port=9000 -d

Resources for learning webpack:

    - https://github.com/petehunt/webpack-howto
    - http://webpack.github.io/docs/tutorials/getting-started/

###


module.exports =
    entry: "./webpack.coffee"

    output:
        filename: "static/webpack.js"

    module:
        loaders: [
            { test: /\.css$/,    loader: 'style!css' },
            { test: /\.cjsx$/,   loaders: ['coffee', 'cjsx'] },
            { test: /\.coffee$/, loader: 'coffee-loader' },
            { test: /\.sass$/,   loaders: ["style", "css", "sass?indentedSyntax"]}  # https://github.com/jtangelder/sass-loader
        ]

    resolve:
        # So we can now require('file') instead of require('file.coffee')
        extensions: ['', '.js', '.json', '.coffee', '.cjsx']
