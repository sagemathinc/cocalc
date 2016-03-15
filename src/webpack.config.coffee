###
Webpack configuration file

Run dev server with source maps:

    npm run webpack-watch

Then visit (say)

    https://dev0.sagemath.com/

or for smc-in-smc project, info.py URL, e.g.

    https://cloud.sagemath.com/14eed217-2d3c-4975-a381-b69edcb40e0e/port/56754/

This is far from ready to use yet, e.g., we need to properly serve primus websockets, etc.:

    webpack-dev-server --port=9000 -d

Resources for learning webpack:

    - https://github.com/petehunt/webpack-howto
    - http://webpack.github.io/docs/tutorials/getting-started/

###
'use strict';

_        = require('lodash')
webpack  = require('webpack')
path     = require('path')
fs       = require('fs')

VERSION  = "0.0.0"
INPUT    = path.resolve(__dirname, "static")
OUTPUT   = "webpack"
DEVEL    = "development"
NODE_ENV = process.env.NODE_ENV || DEVEL
dateISO  = new Date().toISOString()

# create a file base_url to set a base url
BASE_URL = if fs.existsSync('data/base_url') then fs.readFileSync('data/base_url').toString().trim() + "/" else ''
console.log "NODE_ENV=#{NODE_ENV}"
console.log "BASE_URL='#{BASE_URL}'"
console.log "INPUT='#{INPUT}'"
console.log "OUTPUT='#{OUTPUT}'"

# mathjax version → symlink with version info from package.json/version
MATHJAX_DIR = 'smc-webapp/node_modules/mathjax'
MATHJAX_VERS = JSON.parse(fs.readFileSync("#{MATHJAX_DIR}/package.json", 'utf8')).version
MATHJAX_ROOT = path.join(OUTPUT, "mathjax-#{MATHJAX_VERS}")

# webpack plugin to do the linking after it's "done"
class MathjaxVersionedSymlink

MathjaxVersionedSymlink.prototype.apply = (compiler) ->
    compiler.plugin "done", (compilation, cb) ->
        fs.exists MATHJAX_ROOT,  (exists, cb) ->
            if not exists
                fs.symlink("../#{MATHJAX_DIR}", MATHJAX_ROOT, cb)

mathjaxVersionedSymlink = new MathjaxVersionedSymlink()

# plugins

# deterministic hashing for assets
WebpackSHAHash = require('webpack-sha-hash')
webpackSHAHash = new WebpackSHAHash()

# cleanup like "make distclean" (necessary, otherwise there are millions of hashed filenames)
CleanWebpackPlugin = require('clean-webpack-plugin')
cleanWebpackPlugin = new CleanWebpackPlugin [OUTPUT],
                                            verbose: true
                                            dry: false

# assets.json file
AssetsPlugin = require('assets-webpack-plugin')
assetsPlugin = new AssetsPlugin
                        filename   : "assets.json"
                        fullPath   : no
                        prettyPrint: true
                        metadata:
                            version: VERSION
                            date   : dateISO

# https://www.npmjs.com/package/html-webpack-plugin
HtmlWebpackPlugin = require('html-webpack-plugin')
# we need our own chunk sorter, because dependency doesn't work
smcChunkSorter = (a, b) ->
    order = ['css', 'lib', 'smc']
    if order.indexOf(a.names[0]) < order.indexOf(b.names[0])
        return -1
    else
        return 1

jade2html = new HtmlWebpackPlugin
                        date     : dateISO
                        title    : 'SageMathCloud'
                        mathjax  : "#{MATHJAX_ROOT}/MathJax.js"
                        filename : 'index.html'
                        chunksSortMode: smcChunkSorter
                        hash: false
                        template : 'index.jade'

# https://webpack.github.io/docs/stylesheets.html
ExtractTextPlugin = require("extract-text-webpack-plugin")

# merge + minify of included CSS files
cssConfig = JSON.stringify(minimize: true, discardComments: {removeAll: true}, mergeLonghand: true, sourceMap: true)
extractCSS = new ExtractTextPlugin("styles-[hash].css")
extractTextCss  = ExtractTextPlugin.extract("style", "css?sourceMap&#{cssConfig}")
extractTextSass = ExtractTextPlugin.extract("style", "css?#{cssConfig}!sass?sourceMap&indentedSyntax")
extractTextScss = ExtractTextPlugin.extract("style", "css?#{cssConfig}!sass?sourceMap")
extractTextLess = ExtractTextPlugin.extract("style", "css?#{cssConfig}!less?sourceMap")

# custom plugin, to handle the quirky situation of index.html
class MoveFilesToTargetPlugin
    constructor: (@files, @target) ->

MoveFilesToTargetPlugin.prototype.apply = (compiler) ->
    compiler.plugin "done", (comp) =>
        #console.log('compilation:', _.keys(comp.compilation))
        _.forEach @files, (fn) =>
            src = path.join(path.resolve(__dirname, INPUT), fn)
            dst = path.join(@target, fn)
            console.log("moving file:", src, "→", dst)
            fs.renameSync(src, dst)

moveFilesToTargetPlugin = new MoveFilesToTargetPlugin([], OUTPUT)

###
CopyWebpackPlugin = require('copy-webpack-plugin')
copyWebpackPlugin = new CopyWebpackPlugin []
###

setNODE_ENV          = new webpack.DefinePlugin
                                'MATHJAX_VERS': MATHJAX_VERS
                                'MATHJAX_ROOT': MATHJAX_ROOT
                                'VERSION'     : VERSION
                                'process.env' :
                                    'NODE_ENV'     : JSON.stringify(NODE_ENV)

dedupePlugin         = new webpack.optimize.DedupePlugin()
limitChunkCount      = new webpack.optimize.LimitChunkCountPlugin({maxChunks: 10})
minChunkSize         = new webpack.optimize.MinChunkSizePlugin({minChunkSize: 51200})
occurenceOrderPlugin = new webpack.optimize.OccurenceOrderPlugin()
# https://webpack.github.io/docs/list-of-plugins.html#commonschunkplugin
#commonsChunkPlugin   = new webpack.optimize.CommonsChunkPlugin
#                                                name: "vendors"
#                                                # minChunks: Infinity # wouldn't move anything

{StatsWriterPlugin} = require("webpack-stats-plugin")
statsWriterPlugin   = new StatsWriterPlugin(filename: "webpack-stats.json")


#provideGlobals = new webpack.ProvidePlugin
#                                $: "jquery"
#                                jQuery: "jquery"

plugins = [
    cleanWebpackPlugin,
    #provideGlobals,
    setNODE_ENV,
    jade2html,
    #commonsChunkPlugin,
    assetsPlugin,
    moveFilesToTargetPlugin,
    extractCSS,
    #copyWebpackPlugin
    webpackSHAHash,
    statsWriterPlugin,
    mathjaxVersionedSymlink
]

if NODE_ENV != DEVEL
    plugins.push dedupePlugin
    plugins.push occurenceOrderPlugin
    plugins.push limitChunkCount
    plugins.push minChunkSize
    plugins.push new webpack.optimize.UglifyJsPlugin
                            minimize:true
                            comments:false
                            output:
                                comments: false
                            mangle:
                                except: ['$super', '$', 'exports', 'require']
                                screw_ie8: true
                            compress:
                                screw_ie8: true
                                warnings: false
                                properties: true
                                sequences: true
                                dead_code: true
                                conditionals: true
                                comparisons: true
                                evaluate: true
                                booleans: true
                                unused: true
                                loops: true
                                hoist_funs: true
                                cascade: true
                                if_return: true
                                join_vars: true
                                drop_debugger: true
                                negate_iife: true
                                unsafe: true
                                side_effects: true
                            sourceMap: true

hashname    = '[path][name]-[sha256:hash:base64:10].[ext]'
pngconfig   = "name=#{hashname}&limit=2000&mimetype=image/png"
svgconfig   = "name=#{hashname}&limit=2000&mimetype=image/svg+xml"
icoconfig   = "name=#{hashname}&mimetype=image/x-icon"
woffconfig  = "name=#{hashname}&mimetype=application/font-woff"

module.exports =
    cache: true

    entry: # ATTN don't alter or add names here, without changing the sorting function above!
        css  : 'smc-webapp-css.coffee'
        lib  : 'smc-webapp-lib.coffee'
        smc  : 'smc-webapp.coffee'

    output:
        path          : OUTPUT
        publicPath    : path.join(BASE_URL, OUTPUT) + '/'
        filename      : '[name]-[hash].js'
        chunkFilename : '[id]-[hash].js'
        hashFunction  : 'sha256'

    module:
        loaders: [
            { test: /\.cjsx$/,   loaders: ['coffee-loader', 'cjsx-loader'] },
            { test: /\.coffee$/, loader: 'coffee-loader' },
            { test: /\.less$/,   loaders: ["style-loader", "css-loader", "less?#{cssConfig}"]}, #loader : extractTextLess }, # 
            { test: /\.scss$/,   loaders: ["style-loader", "css-loader", "sass?#{cssConfig}"]}, #loader : extractTextScss }, # 
            { test: /\.sass$/,   loaders: ["style-loader", "css-loader", "sass?#{cssConfig}&indentedSyntax"]}, # ,loader : extractTextSass }, # 
            { test: /\.json$/,   loaders: ['json-loader'] },
            { test: /\.png$/,    loader: "url-loader?#{pngconfig}" },
            { test: /\.ico$/,    loader: "file-loader?#{icoconfig}" },
            { test: /\.svg(\?v=[0-9].[0-9].[0-9])?$/,    loader: "url-loader?#{svgconfig}" },
            { test: /\.(jpg|gif)$/,    loader: "file-loader"},
            { test: /\.html$/,   loader: "raw!html-minify"},
            { test: /\.hbs$/,    loader: "handlebars-loader" },
            { test: /\.woff(2)?(\?v=[0-9].[0-9].[0-9])?$/, loader: "url-loader?#{woffconfig}" },
            { test: /\.(ttf|eot)(\?v=[0-9].[0-9].[0-9])?$/, loader: "file-loader?name=#{hashname}" },
            # { test: /\.css$/,    loader: 'style!css' },
            { test: /\.css$/, loaders: ["style-loader", "css-loader?#{cssConfig}"]}, # loader: extractTextCss }, # 
            { test: /\.jade$/, loader: 'jade' },
        ]

    resolve:
        # So we can require('file') instead of require('file.coffee')
        extensions : ['', '.js', '.json', '.coffee', '.cjsx', '.scss', '.sass']
        root       : [path.resolve(__dirname),
                      path.resolve(__dirname, 'smc-util'),
                      path.resolve(__dirname, 'smc-util/node_modules'),
                      path.resolve(__dirname, 'smc-webapp'),
                      path.resolve(__dirname, 'smc-webapp/node_modules')]

    plugins: plugins

    'html-minify-loader':
         empty: true        # KEEP empty attributes
         cdata: true        # KEEP CDATA from scripts
         comments: false