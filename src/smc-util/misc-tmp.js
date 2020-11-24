/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Misc. functions that are needed elsewhere.

let apply_function_to_map_values,
  date_parser,
  escapeRegExp,
  has_null_leaf,
  is_array,
  is_date,
  is_object,
  ISO_to_Date,
  map_without_undefined,
  round1,
  s,
  seconds2hm,
  seconds2hms,
  smc_logger_timestamp_last,
  smc_start_time,
  underscore;
let _ = (underscore = require("underscore"));

exports.RUNNING_IN_NODE =
  (typeof process !== "undefined" && process !== null
    ? process.title
    : undefined) === "node";

const { required, defaults, types } = require("./opts");

// startswith(s, x) is true if s starts with the string x or any of the strings in x.
// It is false if s is not a string.
exports.startswith = function (s, x) {
  if (typeof s !== "string") {
    return false;
  }
  if (typeof x === "string") {
    return (s != null ? s.indexOf(x) : undefined) === 0;
  } else {
    for (let v of Array.from(x)) {
      if ((s != null ? s.indexOf(v) : undefined) === 0) {
        return true;
      }
    }
    return false;
  }
};

exports.endswith = function (s, t) {
  if (s == null || t == null) {
    return false; // undefined doesn't endswith anything...
  }
  return s.slice(s.length - t.length) === t;
};

// Modifies in place the object dest so that it
// includes all values in objs and returns dest
// Rightmost object overwrites left.
exports.merge = function (dest, ...objs) {
  for (let obj of Array.from(objs)) {
    for (let k in obj) {
      const v = obj[k];
      dest[k] = v;
    }
  }
  return dest;
};

// Makes new object that is shallow copy merge of all objects.
exports.merge_copy = (...objs) => exports.merge({}, ...Array.from(objs));

// Return a random element of an array
exports.random_choice = (array) =>
  array[Math.floor(Math.random() * array.length)];

// Like Python's string split -- splits on whitespace
exports.split = function (s) {
  const r = s.match(/\S+/g);
  if (r) {
    return r;
  } else {
    return [];
  }
};

// Current time in milliseconds since epoch
exports.mswalltime = function (t) {
  if (t != null) {
    return new Date().getTime() - t;
  } else {
    return new Date().getTime();
  }
};

// Current time in seconds since epoch, as a floating point number (so much more precise than just seconds).
exports.walltime = function (t) {
  if (t != null) {
    return exports.mswalltime() / 1000.0 - t;
  } else {
    return exports.mswalltime() / 1000.0;
  }
};

// We use this uuid implementation only for the browser client.  For node code, use node-uuid.
exports.uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const uuid_regexp = new RegExp(
  /[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/i
);
exports.is_valid_uuid_string = (uuid) =>
  typeof uuid === "string" && uuid.length === 36 && uuid_regexp.test(uuid);
// /[0-9a-f]{22}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(uuid)

// Return a very rough benchmark of the number of times f will run per second.
exports.times_per_second = function (f, max_time, max_loops) {
  // return number of times per second that f() can be called
  if (max_time == null) {
    max_time = 5;
  }
  if (max_loops == null) {
    max_loops = 1000;
  }
  const t = exports.walltime();
  let i = 0;
  let tm = 0;
  while (true) {
    f();
    tm = exports.walltime() - t;
    i += 1;
    if (tm >= max_time || i >= max_loops) {
      break;
    }
  }
  return Math.ceil(i / tm);
};

exports.to_json = JSON.stringify;

// convert from a JSON string to Javascript (properly dealing with ISO dates)
//   e.g.,   2016-12-12T02:12:03.239Z    and    2016-12-12T02:02:53.358752
const reISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
exports.date_parser = date_parser = function (k, v) {
  if (typeof v === "string" && v.length >= 20 && reISO.exec(v)) {
    return ISO_to_Date(v);
  } else {
    return v;
  }
};

exports.ISO_to_Date = ISO_to_Date = function (s) {
  if (s.indexOf("Z") === -1) {
    // Firefox assumes local time rather than UTC if there is no Z.   However,
    // our backend might possibly send a timestamp with no Z and it should be
    // interpretted as UTC anyways.
    // That said, with the to_json_socket/from_json_socket code, the browser
    // shouldn't be running this parser anyways.
    s += "Z";
  }
  return new Date(s);
};

exports.from_json = function (x) {
  try {
    return JSON.parse(x, date_parser);
  } catch (err) {
    console.debug(
      `from_json: error parsing ${x} (=${exports.to_json(x)}) from JSON`
    );
    throw err;
  }
};

// returns the number of keys of an object, e.g., {a:5, b:7, d:'hello'} --> 3
exports.len = function (obj) {
  if (obj == null) {
    return 0;
  }
  const a = obj.length;
  if (a != null) {
    return a;
  }
  return underscore.keys(obj).length;
};

// return the keys of an object, e.g., {a:5, xyz:'10'} -> ['a', 'xyz']
exports.keys = underscore.keys;

// does the given object (first arg) have the given key (second arg)?
exports.has_key = underscore.has;

// returns the values of a map
exports.values = underscore.values;

exports.max = (array) => array.reduce((a, b) => Math.max(a, b));

exports.min = (array) => array.reduce((a, b) => Math.min(a, b));

const filename_extension_re = /(?:\.([^.]+))?$/;
exports.filename_extension = function (filename) {
  let left;
  filename = exports.path_split(filename).tail;
  return (left = filename_extension_re.exec(filename)[1]) != null ? left : "";
};

exports.filename_extension_notilde = function (filename) {
  let ext = exports.filename_extension(filename);
  while (ext && ext[ext.length - 1] === "~") {
    // strip tildes from the end of the extension -- put there by rsync --backup, and other backup systems in UNIX.
    ext = ext.slice(0, ext.length - 1);
  }
  return ext;
};

// If input name foo.bar, returns object {name:'foo', ext:'bar'}.
// If there is no . in input name, returns {name:name, ext:''}
exports.separate_file_extension = function (name) {
  const ext = exports.filename_extension(name);
  if (ext !== "") {
    name = name.slice(0, name.length - ext.length - 1); // remove the ext and the .
  }
  return { name, ext };
};

// change the filename's extension to the new one.
// if there is no extension, add it.
exports.change_filename_extension = function (name, new_ext) {
  let ext;
  ({ name, ext } = exports.separate_file_extension(name));
  return `${name}.${new_ext}`;
};

// shallow copy of a map
exports.copy = function (obj) {
  if (obj == null || typeof obj !== "object") {
    return obj;
  }
  if (exports.is_array(obj)) {
    return obj.slice();
  }
  const r = {};
  for (let x in obj) {
    const y = obj[x];
    r[x] = y;
  }
  return r;
};

// copy of map but without some keys
// I.e., restrict a function to the complement of a subset of the domain.
exports.copy_without = function (obj, without) {
  if (typeof without === "string") {
    without = [without];
  }
  const r = {};
  for (let x in obj) {
    const y = obj[x];
    if (!Array.from(without).includes(x)) {
      r[x] = y;
    }
  }
  return r;
};

// copy of map but only with some keys
// I.e., restrict a function to a subset of the domain.
exports.copy_with = function (obj, w) {
  if (typeof w === "string") {
    w = [w];
  }
  const r = {};
  for (let x in obj) {
    const y = obj[x];
    if (Array.from(w).includes(x)) {
      r[x] = y;
    }
  }
  return r;
};

// From http://coffeescriptcookbook.com/chapters/classes_and_objects/cloning
exports.deep_copy = function (obj) {
  let newInstance;
  if (obj == null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (obj instanceof RegExp) {
    let flags = "";
    if (obj.global != null) {
      flags += "g";
    }
    if (obj.ignoreCase != null) {
      flags += "i";
    }
    if (obj.multiline != null) {
      flags += "m";
    }
    if (obj.sticky != null) {
      flags += "y";
    }
    return new RegExp(obj.source, flags);
  }

  try {
    newInstance = new obj.constructor();
  } catch (error) {
    newInstance = {};
  }

  for (let key in obj) {
    const val = obj[key];
    newInstance[key] = exports.deep_copy(val);
  }

  return newInstance;
};

// Split a pathname.  Returns an object {head:..., tail:...} where tail is
// everything after the final slash.  Either part may be empty.
// (Same as os.path.split in Python.)
exports.path_split = function (path) {
  const v = path.split("/");
  return { head: v.slice(0, -1).join("/"), tail: v[v.length - 1] };
};

// Takes parts to a path and intelligently merges them on '/'.
// Continuous non-'/' portions of each part will have at most
// one '/' on either side.
// Each part will have exactly one '/' between it and adjacent parts
// Does NOT resolve up-level references
// See misc-tests for examples.
exports.normalized_path_join = function (...parts) {
  const sep = "/";
  const replace = new RegExp(sep + "{1,}", "g");
  const s = (() => {
    const result = [];
    for (let x of Array.from(parts)) {
      if (x != null && `${x}`.length > 0) {
        result.push(`${x}`);
      }
    }
    return result;
  })()
    .join(sep)
    .replace(replace, sep);
  return s;
};


const ELLIPSES = "…";
// "foobar" --> "foo…"
exports.trunc = function (s, max_length) {
  if (max_length == null) {
    max_length = 1024;
  }
  if (s == null) {
    return s;
  }
  if (typeof s !== "string") {
    s = `${s}`;
  }
  if (s.length > max_length) {
    if (max_length < 1) {
      throw new Error("ValueError: max_length must be >= 1");
    }
    return s.slice(0, max_length - 1) + ELLIPSES;
  } else {
    return s;
  }
};

// "foobar" --> "fo…ar"
exports.trunc_middle = function (s, max_length) {
  if (max_length == null) {
    max_length = 1024;
  }
  if (s == null) {
    return s;
  }
  if (typeof s !== "string") {
    s = `${s}`;
  }
  if (s.length <= max_length) {
    return s;
  }
  if (max_length < 1) {
    throw new Error("ValueError: max_length must be >= 1");
  }
  const n = Math.floor(max_length / 2);
  return (
    s.slice(0, n - 1 + (max_length % 2 ? 1 : 0)) +
    ELLIPSES +
    s.slice(s.length - n)
  );
};

// "foobar" --> "…bar"
exports.trunc_left = function (s, max_length) {
  if (max_length == null) {
    max_length = 1024;
  }
  if (s == null) {
    return s;
  }
  if (typeof s !== "string") {
    s = `${s}`;
  }
  if (s.length > max_length) {
    if (max_length < 1) {
      throw new Error("ValueError: max_length must be >= 1");
    }
    return ELLIPSES + s.slice(s.length - max_length + 1);
  } else {
    return s;
  }
};

// gives the plural form of the word if the number should be plural
exports.plural = function (number, singular, plural) {
  if (plural == null) {
    plural = `${singular}s`;
  }
  if (["GB", "MB"].includes(singular)) {
    return singular;
  }
  if (number === 1) {
    return singular;
  } else {
    return plural;
  }
};

const reValidEmail = (function () {
  const sQtext = "[^\\x0d\\x22\\x5c\\x80-\\xff]";
  const sDtext = "[^\\x0d\\x5b-\\x5d\\x80-\\xff]";
  const sAtom =
    "[^\\x00-\\x20\\x22\\x28\\x29\\x2c\\x2e\\x3a-\\x3c\\x3e\\x40\\x5b-\\x5d\\x7f-\\xff]+";
  const sQuotedPair = "\\x5c[\\x00-\\x7f]";
  const sDomainLiteral = `\\x5b(${sDtext}|${sQuotedPair})*\\x5d`;
  const sQuotedString = `\\x22(${sQtext}|${sQuotedPair})*\\x22`;
  const sDomain_ref = sAtom;
  const sSubDomain = `(${sDomain_ref}|${sDomainLiteral})`;
  const sWord = `(${sAtom}|${sQuotedString})`;
  const sDomain = sSubDomain + "(\\x2e" + sSubDomain + ")*";
  const sLocalPart = sWord + "(\\x2e" + sWord + ")*";
  const sAddrSpec = sLocalPart + "\\x40" + sDomain; // complete RFC822 email address spec
  const sValidEmail = `^${sAddrSpec}$`; // as whole string
  return new RegExp(sValidEmail);
})();

exports.is_valid_email_address = function (email) {
  // From http://stackoverflow.com/questions/46155/validate-email-address-in-javascript
  // but converted to Javascript; it's near the middle but claims to be exactly RFC822.
  if (reValidEmail.test(email)) {
    return true;
  } else {
    return false;
  }
};


// An async debounce, kind of like the debounce in http://underscorejs.org/#debounce.
// Crucially, this async_debounce does NOT return a new function and store its state in a closure
// (like the maybe broken https://github.com/juliangruber/async-debounce), so we can use it for
// making async debounced methods in classes (see examples in SMC source code for how to do this).

// TODO: this is actually throttle, not debounce...

exports.async_debounce = function (opts) {
  opts = defaults(opts, {
    f: required, // async function f whose *only* argument is a callback
    interval: 1500, // call f at most this often (in milliseconds)
    state: required, // store state information about debounce in this *object*
    cb: undefined,
  }); // as if f(cb) happens -- cb may be undefined.
  let { f, interval, state, cb } = opts;

  const call_again = function () {
    const n = interval + 1 - (new Date() - state.last);
    //console.log("starting timer for #{n}ms")
    return (state.timer = setTimeout(() => {
      delete state.timer;
      return exports.async_debounce({ f, interval, state });
    }, n));
  };

  if (state.last != null && new Date() - state.last <= interval) {
    // currently running or recently ran -- put in queue for next run
    if (state.next_callbacks == null) {
      state.next_callbacks = [];
    }
    if (cb != null) {
      state.next_callbacks.push(cb);
    }
    //console.log("now have state.next_callbacks of length #{state.next_callbacks.length}")
    if (state.timer == null) {
      call_again();
    }
    return;
  }

  // Not running, so start running
  state.last = new Date(); // when we started running
  // The callbacks that we will call, since they were set before we started running:
  let callbacks = exports.copy(
    state.next_callbacks != null ? state.next_callbacks : []
  );
  // Plus our callback from this time.
  if (cb != null) {
    callbacks.push(cb);
  }
  // Reset next callbacks
  delete state.next_callbacks;
  //console.log("doing run with #{callbacks.length} callbacks")

  return f((err) => {
    // finished running... call callbacks
    //console.log("finished running -- calling #{callbacks.length} callbacks", callbacks)
    for (cb of Array.from(callbacks)) {
      if (typeof cb === "function") {
        cb(err);
      }
    }
    callbacks = []; // ensure these callbacks don't get called again
    //console.log("finished -- have state.next_callbacks of length #{state.next_callbacks.length}")
    if (state.next_callbacks != null && state.timer == null) {
      // new calls came in since when we started, so call when we next can.
      //console.log("new callbacks came in #{state.next_callbacks.length}")
      return call_again();
    }
  });
};


// turn an arbitrary string into a nice clean identifier that can safely be used in an URL
exports.make_valid_name = (s) =>
  // for now we just delete anything that isn't alphanumeric.
  // See http://stackoverflow.com/questions/9364400/remove-not-alphanumeric-characters-from-string-having-trouble-with-the-char/9364527#9364527
  // whose existence surprised me!
  s.replace(/\W/g, "_").toLowerCase();


// See https://github.com/sagemathinc/cocalc/issues/4861
exports.encode_path = function (path) {
  return path.split("/").map(encodeURIComponent).join("/");
};

// see http://stackoverflow.com/questions/1144783/replacing-all-occurrences-of-a-string-in-javascript
exports.replace_all = (string, search, replace) =>
  string.split(search).join(replace);


// fixing the locale to en-US (to pass tests) and (not necessary, but just in case) also the time zone
//return new Date(d*1000).toLocaleDateString(
//    'en-US',
//        year: 'numeric'
//        month: 'long'
//        day: 'numeric'
//        weekday: "long"
//        timeZone: 'UTC'
//)


exports.capitalize = function (s) {
  if (s != null) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
};

exports.is_array = is_array = (obj) =>
  Object.prototype.toString.call(obj) === "[object Array]";

exports.is_integer = Number.isInteger;
if (exports.is_integer == null) {
  exports.is_integer = (n) => typeof n === "number" && n % 1 === 0;
}

exports.is_string = (obj) => typeof obj === "string";

// An object -- this is more constraining that typeof(obj) == 'object', e.g., it does
// NOT include Date.
exports.is_object = is_object = (obj) =>
  Object.prototype.toString.call(obj) === "[object Object]";

exports.is_date = is_date = (obj) => obj instanceof Date;


// Round the given number to 1 decimal place
exports.round1 = round1 = (num) => Math.round(num * 10) / 10;

function round2(num) {
  return Math.round((num + 0.00001) * 100) / 100;
}

const seconds2hms_days = function (d, h, m, longform) {
  let x;
  h = h % 24;
  const s = h * 60 * 60 + m * 60;
  if (s > 0) {
    let show_seconds;
    x = seconds2hms(s, longform, (show_seconds = false));
  } else {
    x = "";
  }
  if (longform) {
    return `${d} ${exports.plural(d, "day")} ${x}`.trim();
  } else {
    return `${d}d${x}`;
  }
};

// like seconds2hms, but only up to minute-resultion
exports.seconds2hm = seconds2hm = (secs, longform) =>
  seconds2hms(secs, longform, false);

// dear future developer: look into test/misc-test.coffee to see how the expected output is defined.
exports.seconds2hms = seconds2hms = function (secs, longform, show_seconds) {
  let ret, s;
  if (show_seconds == null) {
    show_seconds = true;
  }
  if (longform == null) {
    longform = false;
  }
  if (!longform && secs < 10) {
    s = round2(secs % 60);
  } else if (!longform && secs < 60) {
    s = round1(secs % 60);
  } else {
    s = Math.round(secs % 60);
  }
  const m = Math.floor(secs / 60) % 60;
  const h = Math.floor(secs / 60 / 60);
  const d = Math.floor(secs / 60 / 60 / 24);
  // for more than one day, special routine (ignoring seconds altogehter)
  if (d > 0) {
    return seconds2hms_days(d, h, m, longform);
  }
  if (h === 0 && m === 0 && show_seconds) {
    if (longform) {
      return `${s} ${exports.plural(s, "second")}`;
    } else {
      return `${s}s`;
    }
  }
  if (h > 0) {
    if (longform) {
      ret = `${h} ${exports.plural(h, "hour")}`;
      if (m > 0) {
        ret += ` ${m} ${exports.plural(m, "minute")}`;
      }
      return ret;
    } else {
      if (show_seconds) {
        return `${h}h${m}m${s}s`;
      } else {
        return `${h}h${m}m`;
      }
    }
  }
  if (m > 0 || !show_seconds) {
    if (show_seconds) {
      if (longform) {
        ret = `${m} ${exports.plural(m, "minute")}`;
        if (s > 0) {
          ret += ` ${s} ${exports.plural(s, "second")}`;
        }
        return ret;
      } else {
        return `${m}m${s}s`;
      }
    } else {
      if (longform) {
        return `${m} ${exports.plural(m, "minute")}`;
      } else {
        return `${m}m`;
      }
    }
  }
};

exports.range = function (n, m) {
  if (m == null) {
    return __range__(0, n, false);
  } else {
    return __range__(n, m, false);
  }
};



exports.history_path = function (path, old = false) {
  const p = exports.path_split(path);
  if (old) {
    if (p.head) {
      return `${p.head}/.${p.tail}.sage-history`;
    } else {
      return `.${p.tail}.sage-history`;
    }
  } else {
    if (p.head) {
      return `${p.head}/.${p.tail}.time-travel`;
    } else {
      return `.${p.tail}.time-travel`;
    }
  }
};

let smc_logger_timestamp = (smc_logger_timestamp_last = smc_start_time =
  new Date().getTime() / 1000.0);

exports.get_start_time_ts = () => new Date(smc_start_time * 1000);

exports.get_uptime = () =>
  seconds2hms(new Date().getTime() / 1000.0 - smc_start_time);

exports.log = function () {
  smc_logger_timestamp = new Date().getTime() / 1000.0;
  const t = seconds2hms(smc_logger_timestamp - smc_start_time);
  const dt = seconds2hms(smc_logger_timestamp - smc_logger_timestamp_last);
  // support for string interpolation for the actual console.log
  const [msg, ...args] = Array.from(Array.prototype.slice.call(arguments));
  let prompt = `[${t} Δ ${dt}]`;
  if (_.isString(msg)) {
    prompt = `${prompt} ${msg}`;
    console.log_original(prompt, ...Array.from(args));
  } else {
    console.log_original(prompt, msg, ...Array.from(args));
  }
  return (smc_logger_timestamp_last = smc_logger_timestamp);
};

exports.wrap_log = function () {
  if (
    !exports.RUNNING_IN_NODE &&
    typeof window !== "undefined" &&
    window !== null
  ) {
    window.console.log_original = window.console.log;
    return (window.console.log = exports.log);
  }
};

// to test exception handling
exports.this_fails = () => exports.op_to_function("noop");

// derive the console initialization filename from the console's filename
// used in webapp and console_server_child
exports.console_init_filename = function (fn) {
  const x = exports.path_split(fn);
  x.tail = `.${x.tail}.init`;
  if (x.head === "") {
    return x.tail;
  }
  return [x.head, x.tail].join("/");
};

exports.has_null_leaf = has_null_leaf = function (obj) {
  for (let k in obj) {
    const v = obj[k];
    if (v === null || (typeof v === "object" && has_null_leaf(v))) {
      return true;
    }
  }
  return false;
};

// Peer Grading
// this function takes a list of students (actually, arbitrary objects)
// and a number N of the desired number of peers per student.
// It returns a dictionary, mapping each student to a list of peers.
exports.peer_grading = function (students, N) {
  if (N == null) {
    N = 2;
  }
  if (N <= 0) {
    throw "Number of peer assigments must be at least 1";
  }
  if (students.length <= N) {
    throw `You need at least ${N + 1} students`;
  }

  const asmnt = {};
  // make output dict keys sorted like students input array
  students.forEach((s) => (asmnt[s] = []));
  // randomize peer assignments
  const s_random = underscore.shuffle(students);

  // the peer groups are selected here. Think of nodes in a circular graph,
  // and node i is associated with i+1 up to i+N
  const L = students.length;
  for (
    var i = 0, end = L, asc = 0 <= end;
    asc ? i < end : i > end;
    asc ? i++ : i--
  ) {
    asmnt[s_random[i]] = __range__(1, N, true).map(
      (idx) => s_random[(i + idx) % L]
    );
  }

  // sort each peer group by the order of the `student` input list
  for (let k in asmnt) {
    const v = asmnt[k];
    asmnt[k] = underscore.sortBy(v, (s) => students.indexOf(s));
  }
  return asmnt;
};

// demonstration of the above; for tests see misc-test.coffee
exports.peer_grading_demo = function (S, N) {
  if (S == null) {
    S = 10;
  }
  if (N == null) {
    N = 2;
  }
  const { peer_grading } = exports;
  let students = __range__(0, S, false);
  students = (() => {
    const result1 = [];
    for (s of Array.from(students)) {
      result1.push(`S-${s}`);
    }
    return result1;
  })();
  const result = peer_grading(students, (N = N));
  console.log(`${S} students graded by ${N} peers`);
  for (let k in result) {
    const v = result[k];
    console.log(`${k} ←→ ${v}`);
  }
  return result;
};

// converts ticket number to support ticket url (currently zendesk)
exports.ticket_id_to_ticket_url = (tid) =>
  `https://sagemathcloud.zendesk.com/requests/${tid}`;

// Checks if the string only makes sense (heuristically) as downloadable url
exports.is_only_downloadable = (string) =>
  string.indexOf("://") !== -1 || exports.startswith(string, "git@github.com");

exports.ensure_bound = function (x, min, max) {
  if (x < min) {
    return min;
  }
  if (x > max) {
    return max;
  }
  return x;
};

// convert a file path to the "name" of the underlying editor tab.
// needed because otherwise filenames like 'log' would cause problems
exports.path_to_tab = (name) => `editor-${name}`;

// assumes a valid editor tab name...
// If invalid or undefined, returns undefined
exports.tab_to_path = function (name) {
  if (name != null && name.substring(0, 7) === "editor-") {
    return name.substring(7);
  }
};

// suggest a new filename when duplicating it
// 1. strip extension, split at '_' or '-' if it exists
// try to parse a number, if it works, increment it, etc.
exports.suggest_duplicate_filename = function (name) {
  let ext;
  ({ name, ext } = exports.separate_file_extension(name));
  const idx_dash = name.lastIndexOf("-");
  const idx_under = name.lastIndexOf("_");
  const idx = exports.max([idx_dash, idx_under]);
  let new_name = null;
  if (idx > 0) {
    const [prfx, ending] = Array.from([
      name.slice(0, idx + 1),
      name.slice(idx + 1),
    ]);
    const num = parseInt(ending);
    if (!Number.isNaN(num)) {
      new_name = `${prfx}${num + 1}`;
    }
  }
  if (new_name == null) {
    new_name = `${name}-1`;
  }
  if ((ext != null ? ext.length : undefined) > 0) {
    new_name += `.${ext}`;
  }
  return new_name;
};


// Takes an object representing a directed graph shaped as follows:
// DAG =
//     node1 : []
//     node2 : ["node1"]
//     node3 : ["node1", "node2"]
//
// Which represents the following graph:
//   node1 ----> node2
//     |           |
//    \|/          |
//   node3 <-------|
//
// Returns a topological ordering of the DAG
//     object = ["node1", "node2", "node3"]
//
// Throws an error if cyclic
// Runs in O(N + E) where N is the number of nodes and E the number of edges
// Kahn, Arthur B. (1962), "Topological sorting of large networks", Communications of the ACM
exports.top_sort = function (DAG, opts) {
  if (opts == null) {
    opts = { omit_sources: false };
  }
  const { omit_sources } = opts;
  const source_names = [];
  let num_edges = 0;
  const graph_nodes = {};

  // Ready the nodes for top sort
  for (let name in DAG) {
    const parents = DAG[name];
    if (graph_nodes[name] == null) {
      graph_nodes[name] = {};
    }
    const node = graph_nodes[name];
    node.name = name;
    if (node.children == null) {
      node.children = [];
    }
    node.parent_set = {};
    for (let parent_name of parents) {
      node.parent_set[parent_name] = true; // include element in "parent_set" (see https://github.com/sagemathinc/cocalc/issues/1710)

      if (graph_nodes[parent_name] == null) {
        graph_nodes[parent_name] = {};

        // Cover implicit nodes which are assumed to be source nodes
        if (DAG[parent_name] == undefined) {
          source_names.push(parent_name);
        }
      }
      if (graph_nodes[parent_name].children == null) {
        graph_nodes[parent_name].children = [];
      }

      graph_nodes[parent_name].children.push(node);
    }

    if (parents.length === 0) {
      source_names.push(name);
    } else {
      num_edges += parents.length;
    }
  }

  // Top sort! Non-recursive method since recursion is way slow in javascript
  // https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm
  const path = [];
  const num_sources = source_names.length;
  let walked_edges = 0;

  while (source_names.length !== 0) {
    const curr_name = source_names.shift();
    path.push(curr_name);

    for (let child of graph_nodes[curr_name].children) {
      delete child.parent_set[curr_name];
      walked_edges++;
      if (Object.keys(child.parent_set).length === 0) {
        source_names.push(child.name);
      }
    }
  }

  // Detect lack of sources
  if (num_sources === 0) {
    throw new Error("No sources were detected");
  }

  // Detect cycles
  if (num_edges !== walked_edges) {
    if (typeof window !== "undefined" && window !== null) {
      window._DAG = DAG;
    } // so it's possible to debug in browser
    throw new Error("Store has a cycle in its computed values");
  }

  if (omit_sources) {
    return path.slice(num_sources);
  } else {
    return path;
  }
};

// Takes an object with keys and values where
// the values are functions and keys are the names
// of the functions.
// Dependency graph is created from the property
// `dependency_names` found on the values
// Returns an object shaped
// DAG =
//     func_name1 : []
//     func_name2 : ["func_name1"]
//     func_name3 : ["func_name1", "func_name2"]
//
// Which represents the following graph:
//   func_name1 ----> func_name2
//     |                |
//    \|/               |
//   func_name3 <-------|
exports.create_dependency_graph = (object) => {
  const DAG = {};
  for (let name in object) {
    const written_func = object[name];
    DAG[name] =
      written_func.dependency_names != null
        ? written_func.dependency_names
        : [];
  }
  return DAG;
};

// Binds all functions in objects of 'arr_objects' to 'scope'
// Preserves all properties and the toString of these functions
// Returns a new array of objects in the same order given
// Leaves arr_objects unaltered.
exports.bind_objects = (scope, arr_objects) =>
  underscore.map(arr_objects, (object) => {
    return underscore.mapObject(object, (val) => {
      if (typeof val === "function") {
        const original_toString = val.toString();
        const bound_func = val.bind(scope);
        bound_func.toString = () => original_toString;
        Object.assign(bound_func, val);
        return bound_func;
      } else {
        return val;
      }
    });
  });

// ORDER MATTERS! -- this gets looped over and searches happen -- so the 1-character ops must be last.
exports.operators = ["!=", "<>", "<=", ">=", "==", "<", ">", "="];

exports.op_to_function = function (op) {
  switch (op) {
    case "=":
    case "==":
      return (a, b) => a === b;
    case "!=":
    case "<>":
      return (a, b) => a !== b;
    case "<=":
      return (a, b) => a <= b;
    case ">=":
      return (a, b) => a >= b;
    case "<":
      return (a, b) => a < b;
    case ">":
      return (a, b) => a > b;
    default:
      throw Error(
        `operator must be one of '${JSON.stringify(exports.operators)}'`
      );
  }
};

// modify obj in place substituting keys as given.
exports.obj_key_subs = (obj, subs) =>
  (() => {
    const result = [];
    for (let k in obj) {
      const v = obj[k];
      s = subs[k];
      if (s != null) {
        delete obj[k];
        obj[s] = v;
      }
      if (typeof v === "object") {
        result.push(exports.obj_key_subs(v, subs));
      } else if (typeof v === "string") {
        s = subs[v];
        if (s != null) {
          result.push((obj[k] = s));
        } else {
          result.push(undefined);
        }
      } else {
        result.push(undefined);
      }
    }
    return result;
  })();

// this is a helper for sanitizing html. It is used in
// * smc-util-node/misc_node → sanitize_html
// * smc-webapp/misc_page    → sanitize_html
exports.sanitize_html_attributes = ($, node) =>
  $.each(node.attributes, function () {
    // sometimes, "this" is undefined -- #2823
    if (this == null) {
      return;
    }
    const attrName = this.name;
    const attrValue = this.value;
    // remove attribute name start with "on", possible unsafe, e.g.: onload, onerror...
    // remove attribute value start with "javascript:" pseudo protocol, possible unsafe, e.g. href="javascript:alert(1)"
    if (
      (attrName != null ? attrName.indexOf("on") : undefined) === 0 ||
      (attrValue != null ? attrValue.indexOf("javascript:") : undefined) === 0
    ) {
      return $(node).removeAttr(attrName);
    }
  });

// common UTM parameters -- reference: https://en.wikipedia.org/wiki/UTM_parameters
// Parameter                 Purpose/Example
// utm_source (required)     Identifies which site sent the traffic, and is a required parameter.
//                           utm_source=Google
//
// utm_medium                Identifies what type of link was used,
//                           such as cost per click or email.
//                           utm_medium=cpc
//
// utm_campaign              Identifies a specific product promotion or strategic campaign.
//                           utm_campaign=spring_sale
//
// utm_term                  Identifies search terms.
//                           utm_term=running+shoes
//
// utm_content               Identifies what specifically was clicked to bring the user to the site,
//                           such as a banner ad or a text link. It is often used for A/B testing
//                           and content-targeted ads.
//                           utm_content=logolink or utm_content=textlink
exports.utm_keys = ["source", "medium", "campaign", "term", "content"];

// cocalc analytics cookie name
exports.analytics_cookie_name = "CC_ANA";

exports.human_readable_size = function (bytes) {
  let b;
  if (bytes == null) {
    return "?";
  }
  if (bytes < 1000) {
    return `${bytes} bytes`;
  }
  if (bytes < 1000000) {
    b = Math.floor(bytes / 100);
    return `${b / 10} KB`;
  }
  if (bytes < 1000000000) {
    b = Math.floor(bytes / 100000);
    return `${b / 10} MB`;
  }
  b = Math.floor(bytes / 100000000);
  return `${b / 10} GB`;
};

// convert a jupyter kernel language (i.e. "python" or "r", usually short and lowercase)
// to a canonical name.
exports.jupyter_language_to_name = function (lang) {
  if (lang === "python") {
    return "Python";
  } else if (lang === "gap") {
    return "GAP";
  } else if (lang === "sage" || exports.startswith(lang, "sage-")) {
    return "SageMath";
  } else {
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  }
};

// Find the kernel whose name is closest to the given name.
exports.closest_kernel_match = function (name, kernel_list) {
  if (kernel_list == null) return null;
  name = name.toLowerCase().replace("matlab", "octave");
  name = name === "python" ? "python3" : name;
  let bestValue = -1;
  let bestMatch = null;
  for (
    let i = 0, end = kernel_list.size - 1, asc = 0 <= end;
    asc ? i <= end : i >= end;
    asc ? i++ : i--
  ) {
    const k = kernel_list.get(i);
    if (k == null) continue; // This happened to Harald once when using the "mod sim py" custom image.
    // filter out kernels with negative priority (using the priority would be great, though)
    if (k.getIn(["metadata", "cocalc", "priority"], 0) < 0) continue;
    const kernel_name = k.get("name").toLowerCase();
    let v = 0;
    for (
      let j = 0, end1 = name.length - 1, asc1 = 0 <= end1;
      asc1 ? j <= end1 : j >= end1;
      asc1 ? j++ : j--
    ) {
      if (name[j] === kernel_name[j]) {
        v++;
      } else {
        break;
      }
    }
    if (
      v > bestValue ||
      (v === bestValue &&
        bestMatch &&
        compareVersionStrings(k.get("name"), bestMatch.get("name")) === 1)
    ) {
      bestValue = v;
      bestMatch = k;
    }
  }
  return bestMatch;
};

// compareVersionStrings takes two strings "a","b"
// and returns 1 is "a" is bigger, 0 if they are the same, and -1 if "a" is smaller.
// By "bigger" we compare the integer and non-integer parts of the strings separately.
// Examples:
//     - "sage.10" is bigger than "sage.9" (because 10 > 9)
//     - "python.1" is bigger than "sage.9" (because "python" > "sage")
//     - "sage.1.23" is bigger than "sage.0.456" (because 1 > 0)
//     - "sage.1.2.3" is bigger than "sage.1.2" (because "." > "")
var compareVersionStrings = function (a, b) {
  a = a.split(/(\d+)/);
  b = b.split(/(\d+)/);
  for (
    let i = 0, end = Math.max(a.length, b.length) - 1, asc = 0 <= end;
    asc ? i <= end : i >= end;
    asc ? i++ : i--
  ) {
    const l = a[i] || "";
    const r = b[i] || "";
    if (/\d/.test(l) && /\d/.test(r)) {
      const vA = parseInt(l);
      const vB = parseInt(r);
      if (vA > vB) {
        return 1;
      }
      if (vA < vB) {
        return -1;
      }
    } else {
      if (l > r) {
        return 1;
      }
      if (l < r) {
        return -1;
      }
    }
  }
  return 0;
};

function __range__(left, right, inclusive) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}
