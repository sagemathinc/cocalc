/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: MS-RSL – see LICENSE.md for details
//########################################################################

// Catch and report webapp client errors to the SMC server.
// This is based on bugsnag's MIT licensed lib: https://github.com/bugsnag/bugsnag-js
// The basic idea is to wrap very early at a very low level of the event system,
// such that all libraries loaded later are sitting on top of this.
// Additionally, special care is taken to browser brands and their capabilities.
// Finally, additional data about the webapp client is gathered and sent with the error report.

// list of string-identifyers of errors, that were already reported.
// this avoids excessive resubmission of errors
let ENABLED;
const already_reported = [];

const FUNCTION_REGEX = /function\s*([\w\-$]+)?\s*\(/i;

let ignoreOnError = 0;

let shouldCatch = true;

// set this to true, to enable the webapp error reporter for development
const enable_for_testing = false;
if (typeof BACKEND !== "undefined" && BACKEND) {
  // never enable on the backend -- used by static react rendering.
  ENABLED = false;
} else {
  ENABLED = !DEBUG || enable_for_testing;
}

// this is the MAIN function of this module
// it's exported publicly and also used in various spots where exceptions are already
// caught and reported to the browser's console.
const reportException = function (exception, name, severity, comment) {
  if (!exception || typeof exception === "string") {
    return;
  }
  // setting those *Number defaults to `undefined` breaks somehow on its way
  // to the DB (it only wants NULL or an int). -1 is signaling that there is no info.
  return sendError({
    name: name || exception.name,
    message: exception.message || exception.description,
    comment: comment != null ? comment : "",
    stacktrace: stacktraceFromException(exception) || generateStacktrace(),
    file: exception.fileName || exception.sourceURL,
    path: window.location.href,
    lineNumber: exception.lineNumber || exception.line || -1,
    columnNumber: exception.columnNumber || -1,
    severity: severity || "default",
  });
};

const WHITELIST = [
  "componentWillMount has been renamed",
  "componentWillReceiveProps has been renamed",
  // Ignore this antd message in browser:
  "a whole package of antd",
  // we can't do anything about bokeh crashes in their own code
  "cdn.bokeh.org",
  // xtermjs
  "renderRows",
  "Viewport.syncScrollArea",
];
const isWhitelisted = function (opts) {
  const s = JSON.stringify(opts);
  for (let x of WHITELIST) {
    if (s.indexOf(x) !== -1) {
      return true;
    }
  }
  return false;
};

// this is the final step sending the error report.
// it gathers additional information about the webapp client.
let currentlySendingError = false;
const sendError = async function (opts) {
  // console.log("sendError", currentlySendingError, opts);
  if (currentlySendingError) {
    // errors can be crazy and easily DOS the user's connection.  Since this table is
    // just something we manually check sometimes, not sending too many errors is
    // best.  We send at most one at a time.  See https://github.com/sagemathinc/cocalc/issues/5771
    return;
  }
  currentlySendingError = true;
  try {
    //console.log 'sendError', opts
    let webapp_client;
    if (isWhitelisted(opts)) {
      //console.log 'sendError: whitelisted'
      return;
    }
    const misc = require("@cocalc/util/misc");
    opts = misc.defaults(opts, {
      name: misc.required,
      message: misc.required,
      comment: "",
      stacktrace: "",
      file: "",
      path: "",
      lineNumber: -1,
      columnNumber: -1,
      severity: "default",
    });
    const fingerprint = misc.uuidsha1(
      [opts.name, opts.message, opts.comment].join("::"),
    );
    if (already_reported.includes(fingerprint) && !DEBUG) {
      return;
    }
    already_reported.push(fingerprint);
    // attaching some additional info
    const feature = require("@cocalc/frontend/feature");
    opts.user_agent = navigator?.userAgent;
    opts.browser = feature.get_browser();
    opts.mobile = feature.IS_MOBILE;
    opts.smc_version = SMC_VERSION;
    opts.build_date = BUILD_DATE;
    opts.smc_git_rev = COCALC_GIT_REVISION;
    opts.uptime = misc.get_uptime();
    opts.start_time = misc.get_start_time_ts();
    if (DEBUG) {
      console.info("error reporter sending:", opts);
    }
    try {
      // During initial load in some situations evidently webapp_client
      // is not yet initialized, and webapp_client is undefined.  (Maybe
      // a typescript rewrite of everything relevant will help...).  In
      // any case, for now we
      //   https://github.com/sagemathinc/cocalc/issues/4769
      // As an added bonus, by try/catching and retrying once at least,
      // we are more likely to get the error report in case of a temporary
      // network or other glitch....
      // console.log("sendError: import webapp_client");

      ({ webapp_client } = require("@cocalc/frontend/webapp-client")); // can possibly be undefined
      // console.log 'sendError: sending error'
      return await webapp_client.tracking_client.webapp_error(opts); // might fail.
      // console.log 'sendError: got response'
    } catch (err) {
      console.info(
        "failed to report error; trying again in 30 seconds",
        err,
        opts,
      );
      const { delay } = require("awaiting");
      await delay(30000);
      try {
        ({ webapp_client } = require("@cocalc/frontend/webapp-client"));
        return await webapp_client.tracking_client.webapp_error(opts);
      } catch (error) {
        err = error;
        return console.info("failed to report error", err);
      }
    }
  } finally {
    currentlySendingError = false;
  }
};

// neat trick to get a stacktrace when there is none
var generateStacktrace = function () {
  let stacktrace;
  let generated = (stacktrace = null);
  const MAX_FAKE_STACK_SIZE = 10;
  const ANONYMOUS_FUNCTION_PLACEHOLDER = "[anonymous]";

  try {
    throw new Error("");
  } catch (exception) {
    generated = "<generated>\n";
    stacktrace = stacktraceFromException(exception);
  }

  if (!stacktrace) {
    generated = "<generated-ie>\n";
    const functionStack = [];
    try {
      let curr = arguments.callee.caller.caller;
      while (curr && functionStack.length < MAX_FAKE_STACK_SIZE) {
        var fn;
        if (FUNCTION_REGEX.test(curr.toString())) {
          fn = RegExp.$1 != null ? RegExp.$1 : ANONYMOUS_FUNCTION_PLACEHOLDER;
        } else {
          fn = ANONYMOUS_FUNCTION_PLACEHOLDER;
        }
        functionStack.push(fn);
        curr = curr.caller;
      }
    } catch (e) {}
    //console.error(e)
    stacktrace = functionStack.join("\n");
  }
  return generated + stacktrace;
};

var stacktraceFromException = (exception) =>
  exception.stack || exception.backtrace || exception.stacktrace;

// Disable catching on IE < 10 as it destroys stack-traces from generateStackTrace()
// OF COURSE, COCALC doesn't support any version of IE at all, so ...
if (!window.atob) {
  shouldCatch = false;
}

// Disable catching on browsers that support HTML5 ErrorEvents properly.
// This lets debug on unhandled exceptions work.
// TODO: enabling the block below distorts (at least) Chrome error messages.
// Maybe Chrome's window.onerror doesn't work as assumed?
// else if window.ErrorEvent
//     try
//         if new window.ErrorEvent("test").colno == 0
//             shouldCatch = false
//     catch e
//         # No action needed

// flag to ignore "onerror" when already wrapped in the event handler
const ignoreNextOnError = function () {
  ignoreOnError += 1;
  return window.setTimeout(() => (ignoreOnError -= 1));
};

// this is the "brain" of all this
const wrap = function (_super) {
  try {
    if (typeof _super !== "function") {
      return _super;
    }

    if (!_super._wrapper) {
      _super._wrapper = function () {
        if (shouldCatch) {
          try {
            return _super.apply(this, arguments);
          } catch (e) {
            reportException(e, null, "error");
            ignoreNextOnError();
            throw e;
          }
        } else {
          return _super.apply(this, arguments);
        }
      };

      _super._wrapper._wrapper = _super._wrapper;
    }

    return _super._wrapper;
  } catch (error) {
    const e = error;
    return _super;
  }
};

// replaces an attribute of an object by a function that has it as an argument
const polyFill = function (obj, name, makeReplacement) {
  const original = obj[name];
  const replacement = makeReplacement(original);
  return (obj[name] = replacement);
};

// wrap all prototype objects that have event handlers
// first one is for chrome, the first three for FF, the rest for IE, Safari, etc.
if (ENABLED) {
  "EventTarget Window Node ApplicationCache AudioTrackList ChannelMergerNode CryptoOperation EventSource FileReader HTMLUnknownElement IDBDatabase IDBRequest IDBTransaction KeyOperation MediaController MessagePort ModalWindow Notification SVGElementInstance Screen TextTrack TextTrackCue TextTrackList WebSocket WebSocketWorker Worker XMLHttpRequest XMLHttpRequestEventTarget XMLHttpRequestUpload".replace(
    /\w+/g,
    function (global) {
      const prototype = window[global]?.prototype;
      if (prototype?.hasOwnProperty?.("addEventListener")) {
        polyFill(
          prototype,
          "addEventListener",
          (_super) =>
            function (e, f, capture, secure) {
              try {
                if (f && f.handleEvent) {
                  f.handleEvent = wrap(f.handleEvent);
                }
              } catch (err) {}
              //console.log(err)
              return _super.call(this, e, wrap(f), capture, secure);
            },
        );

        return polyFill(
          prototype,
          "removeEventListener",
          (_super) =>
            function (e, f, capture, secure) {
              _super.call(this, e, f, capture, secure);
              return _super.call(this, e, wrap(f), capture, secure);
            },
        );
      }
    },
  );
}

if (ENABLED) {
  polyFill(
    window,
    "onerror",
    (_super) =>
      function (message, url, lineNo, charNo, exception) {
        // IE 6+ support.
        if (!charNo && window.event) {
          charNo = window.event.errorCharacter;
        }

        //if DEBUG
        //    console.log("intercepted window.onerror", message, url, lineNo, charNo, exception)

        if (ignoreOnError === 0) {
          const name = exception?.name || "window.onerror";
          const stacktrace =
            (exception && stacktraceFromException(exception)) ||
            generateStacktrace();
          sendError({
            name,
            message,
            file: url,
            path: window.location.href,
            lineNumber: lineNo,
            columnNumber: charNo,
            stacktrace,
            severity: "error",
          });
        }

        // Fire the existing `window.onerror` handler, if one exists
        if (_super) {
          return _super(message, url, lineNo, charNo, exception);
        }
      },
  );
}

// timing functions

const hijackTimeFunc = (_super) =>
  function (f, t) {
    if (typeof f === "function") {
      f = wrap(f);
      const args = Array.prototype.slice.call(arguments, 2);
      return _super(function () {
        return f.apply(this, args);
      }, t);
    } else {
      return _super(f, t);
    }
  };

if (ENABLED) {
  polyFill(window, "setTimeout", hijackTimeFunc);
  polyFill(window, "setInterval", hijackTimeFunc);
}

if (ENABLED && window.requestAnimationFrame) {
  polyFill(
    window,
    "requestAnimationFrame",
    (_super) => (callback) => _super(wrap(callback)),
  );
}

if (ENABLED && window.setImmediate) {
  polyFill(
    window,
    "setImmediate",
    (_super) =>
      function () {
        const args = Array.prototype.slice.call(arguments);
        args[0] = wrap(args[0]);
        return _super.apply(this, args);
      },
  );
}

// console terminal

function argsToJson(args) {
  let v = [];
  try {
    const misc = require("@cocalc/util/misc");
    for (const arg of args) {
      try {
        const s = JSON.stringify(arg);
        v.push(s.length > 1000 ? misc.trunc_middle(s) : JSON.parse(s));
      } catch (_) {
        v.push("(non-jsonable-arg)");
      }
      if (v.length > 10) {
        v.push("(skipping JSON of some args)");
        break;
      }
    }
  } catch (_) {
    // must be robust.
    v.push("(unable to JSON some args)");
  }
  return JSON.stringify(v);
}

const sendLogLine = (severity, args) => {
  let message;
  if (typeof args === "object") {
    message = argsToJson(args);
  } else {
    message = Array.prototype.slice.call(args).join(", ");
  }
  sendError({
    name: "Console Output",
    message,
    file: "",
    path: window.location.href,
    lineNumber: -1,
    columnNumber: -1,
    stacktrace: generateStacktrace(),
    severity,
  });
};

const wrapFunction = function (object, property, newFunction) {
  const oldFunction = object[property];
  return (object[property] = function () {
    newFunction.apply(this, arguments);
    if (typeof oldFunction === "function") {
      return oldFunction.apply(this, arguments);
    }
  });
};

if (ENABLED && window.console != null) {
  wrapFunction(console, "warn", function () {
    return sendLogLine("warn", arguments);
  });
  wrapFunction(console, "error", function () {
    return sendLogLine("error", arguments);
  });
}

if (ENABLED) {
  window.addEventListener("unhandledrejection", (e) => {
    // just to make sure there is a message
    let reason = e.reason != null ? e.reason : "<no reason>";
    if (typeof reason === "object") {
      let left;
      const misc = require("@cocalc/util/misc");
      reason = `${
        (left = reason.stack != null ? reason.stack : reason.message) != null
          ? left
          : misc.trunc_middle(misc.to_json(reason), 1000)
      }`;
    }
    e.message = `unhandledrejection: ${reason}`;
    reportException(e, "unhandledrejection");
  });
}

// public API

exports.reportException = reportException;

if (DEBUG) {
  if (window.cc == null) {
    window.cc = {};
  }
  window.cc.webapp_error_reporter = {
    shouldCatch() {
      return shouldCatch;
    },
    ignoreOnError() {
      return ignoreOnError;
    },
    already_reported() {
      return already_reported;
    },
    stacktraceFromException,
    generateStacktrace,
    sendLogLine,
    reportException,
    is_enabled() {
      return ENABLED;
    },
  };
}
