###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014 -- 2016, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

###

Catch and report webapp client errors to the SMC server.

some ideas inspired by bugsnag's MIT licensed lib

TODO: event handler wrapping of "window.onerror"

###

# list of string-identifyers of errors, that were already reported.
# this avoids excessive resubmission of errors
already_reported = []

FUNCTION_REGEX = /function\s*([\w\-$]+)?\s*\(/i

ignoreOnError = 0

sendError = (opts) ->
    #console.log opts
    {required, defaults, uuidsha1} = require('smc-util/misc')
    opts = defaults opts,
        name            : required
        message         : required
        stacktrace      : ''
        file            : ''
        lineNumber      : -1
        columnNumber    : -1
        severity        : 'default'
    fingerprint = uuidsha1(opts.name + '::' + opts.message)
    if fingerprint in already_reported and not DEBUG
        return
    already_reported.push(fingerprint)
    {IS_MOBILE, get_browser, is_responsive_mode} = require('smc-webapp/feature')
    opts.user_agent = navigator?.userAgent
    opts.path       = window.location.pathname
    opts.browser    = get_browser()
    opts.mobile     = IS_MOBILE
    opts.responsive = is_responsive_mode()
    if DEBUG then console.info('error reporter sending:', opts)
    {salvus_client} = require('smc-webapp/salvus_client')
    salvus_client.webapp_error(opts)

generateStacktrace = () ->
    generated = stacktrace = null
    MAX_FAKE_STACK_SIZE = 10
    ANONYMOUS_FUNCTION_PLACEHOLDER = "[anonymous]"

    try
        throw new Error("")
    catch exception
        generated = "<generated>\n"
        stacktrace = stacktraceFromException(exception)

    if (!stacktrace)
        generated = "<generated-ie>\n"
        functionStack = []
        try
            curr = arguments.callee.caller.caller;
            while (curr && functionStack.length < MAX_FAKE_STACK_SIZE)
                fn = if FUNCTION_REGEX.test(curr.toString()) then (RegExp.$1 ? ANONYMOUS_FUNCTION_PLACEHOLDER) else ANONYMOUS_FUNCTION_PLACEHOLDER
            functionStack.push(fn)
            curr = curr.caller
        catch e
            #console.error(e)
        stacktrace = functionStack.join("\n");
    return generated + stacktrace

stacktraceFromException = (exception) ->
    return exception.stack || exception.backtrace || exception.stacktrace

notifyException = (exception, name, metaData, severity) ->
    if !exception or typeof exceptoin == "string"
        return
    sendError(
        name: name || exception.name
        message: exception.message || exception.description
        stacktrace: stacktraceFromException(exception) || generateStacktrace()
        file: exception.fileName || exception.sourceURL
        lineNumber: exception.lineNumber || exception.line || -1
        columnNumber: exception.columnNumber || -1
        severity: severity || "default"
    )

ignoreNextOnError = () ->
    ignoreOnError += 1
    window.setTimeout(() ->
        ignoreOnError -= 1
    )

wrap = (_super) ->
    try
        if typeof _super != "function"
            return _super

        if !_super._wrapper
            _super._wrapper = () ->

                try
                    return _super.apply(this, arguments)
                catch e
                    notifyException(e, null, null, "error")
                    #console.log(e, null, null, "error")
                    ignoreNextOnError()
                    throw e

            _super._wrapper._wrapper = _super._wrapper

        return _super._wrapper

    catch e
        return _super

polyFill = (obj, name, makeReplacement) ->
    original = obj[name]
    replacement = makeReplacement(original)
    obj[name] = replacement


"EventTarget Window Node ApplicationCache AudioTrackList ChannelMergerNode CryptoOperation EventSource FileReader HTMLUnknownElement IDBDatabase IDBRequest IDBTransaction KeyOperation MediaController MessagePort ModalWindow Notification SVGElementInstance Screen TextTrack TextTrackCue TextTrackList WebSocket WebSocketWorker Worker XMLHttpRequest XMLHttpRequestEventTarget XMLHttpRequestUpload".replace(/\w+/g, (global) ->
    prototype = window[global] && window[global].prototype
    if prototype && prototype.hasOwnProperty && prototype.hasOwnProperty("addEventListener")
        polyFill(prototype, "addEventListener", (_super) ->
            return (e, f, capture, secure) ->
                try
                    if f and f.handleEvent
                        f.handleEvent = wrap(f.handleEvent)
                catch err
                    #console.log(err)
                return _super.call(this, e, wrap(f), capture, secure)
        )

        polyFill(prototype, "removeEventListener", (_super) ->
          return (e, f, capture, secure) ->
            _super.call(this, e, f, capture, secure)
            return _super.call(this, e, wrap(f), capture, secure)
        )
)
