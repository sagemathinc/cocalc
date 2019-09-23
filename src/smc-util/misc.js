/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2014 -- 2016, SageMath, Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

//#########################################################################
//
// Misc. functions that are needed elsewhere.
//
//#########################################################################
//
//##############################################################################
// Copyright (C) 2016, Sagemath Inc.
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this
//    list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//##############################################################################

let apply_function_to_map_values,
  date_parser,
  escapeRegExp,
  fix_json_dates,
  has_null_leaf,
  is_array,
  is_date,
  is_object,
  ISO_to_Date,
  map_without_undefined,
  round1,
  round2,
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
// We explicitly export these again for backwards compatibility
exports.required = required;
exports.defaults = defaults;
exports.types = types;

// startswith(s, x) is true if s starts with the string x or any of the strings in x.
// It is false if s is not a string.
exports.startswith = function(s, x) {
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

exports.endswith = function(s, t) {
  if (s == null || t == null) {
    return false; // undefined doesn't endswith anything...
  }
  return s.slice(s.length - t.length) === t;
};

// Modifies in place the object dest so that it
// includes all values in objs and returns dest
// Rightmost object overwrites left.
exports.merge = function(dest, ...objs) {
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
exports.random_choice = array =>
  array[Math.floor(Math.random() * array.length)];

// Given an object map {foo:bar, ...} returns an array [foo, bar] randomly
// chosen from the object map.
exports.random_choice_from_obj = function(obj) {
  const k = exports.random_choice(exports.keys(obj));
  return [k, obj[k]];
};

// Returns a random integer in the range, inclusive (like in Python)
exports.randint = function(lower, upper) {
  if (lower > upper) {
    throw new Error("randint: lower is larger than upper");
  }
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
};

// Like Python's string split -- splits on whitespace
exports.split = function(s) {
  const r = s.match(/\S+/g);
  if (r) {
    return r;
  } else {
    return [];
  }
};

// Like the exports.split method, but quoted terms are grouped together for an exact search.
exports.search_split = function(search) {
  const terms = [];
  search = search.split('"');
  const { length } = search;
  for (let i = 0; i < search.length; i++) {
    let element = search[i];
    element = element.trim();
    if (element.length !== 0) {
      // the even elements lack quotation
      // if there are an even number of elements that means there is an unclosed quote,
      // so the last element shouldn't be grouped.
      if (i % 2 === 0 || (i === length - 1 && length % 2 === 0)) {
        terms.push(...Array.from(element.split(" ") || []));
      } else {
        terms.push(element);
      }
    }
  }
  return terms;
};

// s = lower case string
// v = array of terms as output by search_split above
exports.search_match = function(s, v) {
  if (s == null) {
    return false;
  }
  for (let x of Array.from(v)) {
    if (s.indexOf(x) === -1) {
      return false;
    }
  }
  return true;
};

// return true if the word contains the substring
exports.contains = (word, sub) => word.indexOf(sub) !== -1;

// Count number of occurrences of m in s-- see http://stackoverflow.com/questions/881085/count-the-number-of-occurences-of-a-character-in-a-string-in-javascript

exports.count = function(str, strsearch) {
  let index = -1;
  let count = -1;
  while (true) {
    index = str.indexOf(strsearch, index + 1);
    count++;
    if (index === -1) {
      break;
    }
  }
  return count;
};

// modifies target in place, so that the properties of target are the
// same as those of upper_bound, and each is <=.
exports.min_object = function(target, upper_bounds) {
  if (target == null) {
    target = {};
  }
  for (let prop in upper_bounds) {
    const val = upper_bounds[prop];
    target[prop] = target.hasOwnProperty(prop)
      ? (target[prop] = Math.min(target[prop], upper_bounds[prop]))
      : upper_bounds[prop];
  }
  return target;
};

// Current time in milliseconds since epoch
exports.mswalltime = function(t) {
  if (t != null) {
    return new Date().getTime() - t;
  } else {
    return new Date().getTime();
  }
};

// Current time in seconds since epoch, as a floating point number (so much more precise than just seconds).
exports.walltime = function(t) {
  if (t != null) {
    return exports.mswalltime() / 1000.0 - t;
  } else {
    return exports.mswalltime() / 1000.0;
  }
};

// We use this uuid implementation only for the browser client.  For node code, use node-uuid.
exports.uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const uuid_regexp = new RegExp(
  /[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/i
);
exports.is_valid_uuid_string = uuid =>
  typeof uuid === "string" && uuid.length === 36 && uuid_regexp.test(uuid);
// /[0-9a-f]{22}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(uuid)

exports.assert_uuid = uuid => {
  if (!exports.is_valid_uuid_string(uuid)) {
    throw Error(`invalid uuid='${uuid}'`);
  }
};

exports.is_valid_sha1_string = s =>
  typeof s === "string" && s.length === 40 && /[a-fA-F0-9]{40}/i.test(s);

// Compute a uuid v4 from the Sha-1 hash of data.
// If on backend, use the version in misc_node, which is faster.
const sha1 = require("sha1");
exports.uuidsha1 = function(data) {
  const s = sha1(data);
  let i = -1;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    i += 1;
    switch (c) {
      case "x":
        return s[i];
      case "y":
        // take 8 + low order 3 bits of hex number.
        return ((parseInt(`0x${s[i]}`, 16) & 0x3) | 0x8).toString(16);
    }
  });
};

const zipcode = new RegExp("^\\d{5}(-\\d{4})?$");
exports.is_valid_zipcode = zip => zipcode.test(zip);

// Return a very rough benchmark of the number of times f will run per second.
exports.times_per_second = function(f, max_time, max_loops) {
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

/*
The functions to_json_socket and from_json_socket are for sending JSON data back
and forth in serialized form over a socket connection.   They replace Date objects by the
object {DateEpochMS:ms_since_epoch} *only* during transit.   This is much better than
converting to ISO, then using a regexp, since then all kinds of strings will get
converted that were never meant to be date objects at all, e.g., a filename that is
a ISO time string.  Also, ms since epoch is less ambiguous regarding old/different
browsers, and more compact.

If you change SOCKET_DATE_KEY, then all clients and servers and projects must be
simultaneously restarted.
*/
const SOCKET_DATE_KEY = "DateEpochMS";

const socket_date_replacer = function(key, value) {
  if (this[key] instanceof Date) {
    const date = this[key];
    return { [SOCKET_DATE_KEY]: date - 0 };
  } else {
    return value;
  }
};

exports.to_json_socket = x => JSON.stringify(x, socket_date_replacer);

const socket_date_parser = function(key, value) {
  if ((value != null ? value[SOCKET_DATE_KEY] : undefined) != null) {
    return new Date(value[SOCKET_DATE_KEY]);
  } else {
    return value;
  }
};

exports.from_json_socket = function(x) {
  try {
    return JSON.parse(x, socket_date_parser);
  } catch (err) {
    console.debug(
      `from_json: error parsing ${x} (=${exports.to_json(x)}) from JSON`
    );
    throw err;
  }
};

// convert object x to a JSON string, removing any keys that have "pass" in them and
// any values that are potentially big -- this is meant to only be used for logging.
exports.to_safe_str = function(x) {
  if (typeof x === "string") {
    // nothing we can do at this point -- already a string.
    return x;
  }
  const obj = {};
  for (let key in x) {
    let value = x[key];
    let sanitize = false;

    if (key.indexOf("pass") !== -1) {
      sanitize = true;
    } else if (typeof value === "string" && value.slice(0, 7) === "sha512$") {
      sanitize = true;
    }

    if (sanitize) {
      obj[key] = "(unsafe)";
    } else {
      if (typeof value === "object") {
        value = "[object]"; // many objects, e.g., buffers can block for seconds to JSON...
      } else if (typeof value === "string") {
        value = exports.trunc(value, 250); // long strings are not SAFE -- since JSON'ing them for logging blocks for seconds!
      }
      obj[key] = value;
    }
  }

  return (x = exports.to_json(obj));
};

// convert from a JSON string to Javascript (properly dealing with ISO dates)
//   e.g.,   2016-12-12T02:12:03.239Z    and    2016-12-12T02:02:53.358752
const reISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
exports.date_parser = date_parser = function(k, v) {
  if (typeof v === "string" && v.length >= 20 && reISO.exec(v)) {
    return ISO_to_Date(v);
  } else {
    return v;
  }
};

exports.ISO_to_Date = ISO_to_Date = function(s) {
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

exports.from_json = function(x) {
  try {
    return JSON.parse(x, date_parser);
  } catch (err) {
    console.debug(
      `from_json: error parsing ${x} (=${exports.to_json(x)}) from JSON`
    );
    throw err;
  }
};

// Returns modified version of obj with any string
// that look like ISO dates to actual Date objects.  This mutates
// obj in place as part of the process.
// date_keys = 'all' or list of keys in nested object whose values should be considered.  Nothing else is considered!
exports.fix_json_dates = fix_json_dates = function(obj, date_keys) {
  if (date_keys == null) {
    // nothing to do
    return obj;
  }
  if (exports.is_object(obj)) {
    for (let k in obj) {
      const v = obj[k];
      if (typeof v === "object") {
        fix_json_dates(v, date_keys);
      } else if (
        typeof v === "string" &&
        v.length >= 20 &&
        reISO.exec(v) &&
        (date_keys === "all" || Array.from(date_keys).includes(k))
      ) {
        obj[k] = new Date(v);
      }
    }
  } else if (exports.is_array(obj)) {
    for (let i in obj) {
      const x = obj[i];
      obj[i] = fix_json_dates(x, date_keys);
    }
  } else if (
    typeof obj === "string" &&
    obj.length >= 20 &&
    reISO.exec(obj) &&
    date_keys === "all"
  ) {
    return new Date(obj);
  }
  return obj;
};

// converts a Date object to an ISO string in UTC.
// NOTE -- we remove the +0000 (or whatever) timezone offset, since *all* machines within
// the CoCalc servers are assumed to be on UTC.
exports.to_iso = d =>
  new Date(d - d.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, -5);

// turns a Date object into a more human readable more friendly directory name in the local timezone
exports.to_iso_path = d =>
  exports
    .to_iso(d)
    .replace("T", "-")
    .replace(/:/g, "");

// returns true if the given object has no keys
exports.is_empty_object = obj => Object.keys(obj).length === 0;

// returns the number of keys of an object, e.g., {a:5, b:7, d:'hello'} --> 3
exports.len = function(obj) {
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

// as in python, makes a map from an array of pairs [(x,y),(z,w)] --> {x:y, z:w}
exports.dict = function(obj) {
  const x = {};
  for (let a of Array.from(obj)) {
    if (a.length !== 2) {
      throw new Error("ValueError: unexpected length of tuple");
    }
    x[a[0]] = a[1];
  }
  return x;
};

// remove first occurrence of value (just like in python);
// throws an exception if val not in list.
exports.remove = function(obj, val) {
  for (
    let i = 0, end = obj.length, asc = 0 <= end;
    asc ? i < end : i > end;
    asc ? i++ : i--
  ) {
    if (obj[i] === val) {
      obj.splice(i, 1);
      return;
    }
  }
  throw new Error("ValueError -- item not in array");
};

// convert an array of 2-element arrays to an object, e.g., [['a',5], ['xyz','10']] --> {a:5, xyz:'10'}
exports.pairs_to_obj = function(v) {
  const o = {};
  for (let x of Array.from(v)) {
    o[x[0]] = x[1];
  }
  return o;
};

exports.obj_to_pairs = obj =>
  (() => {
    const result = [];
    for (let x in obj) {
      const y = obj[x];
      result.push([x, y]);
    }
    return result;
  })();

// from http://stackoverflow.com/questions/4009756/how-to-count-string-occurrence-in-string via http://js2coffee.org/
exports.substring_count = function(string, subString, allowOverlapping) {
  string += "";
  subString += "";
  if (subString.length <= 0) {
    return string.length + 1;
  }
  let n = 0;
  let pos = 0;
  const step = allowOverlapping ? 1 : subString.length;
  while (true) {
    pos = string.indexOf(subString, pos);
    if (pos >= 0) {
      n++;
      pos += step;
    } else {
      break;
    }
  }
  return n;
};

exports.max = array => array.reduce((a, b) => Math.max(a, b));

exports.min = array => array.reduce((a, b) => Math.min(a, b));

const filename_extension_re = /(?:\.([^.]+))?$/;
exports.filename_extension = function(filename) {
  let left;
  filename = exports.path_split(filename).tail;
  return (left = filename_extension_re.exec(filename)[1]) != null ? left : "";
};

exports.filename_extension_notilde = function(filename) {
  let ext = exports.filename_extension(filename);
  while (ext && ext[ext.length - 1] === "~") {
    // strip tildes from the end of the extension -- put there by rsync --backup, and other backup systems in UNIX.
    ext = ext.slice(0, ext.length - 1);
  }
  return ext;
};

// If input name foo.bar, returns object {name:'foo', ext:'bar'}.
// If there is no . in input name, returns {name:name, ext:''}
exports.separate_file_extension = function(name) {
  const ext = exports.filename_extension(name);
  if (ext !== "") {
    name = name.slice(0, name.length - ext.length - 1); // remove the ext and the .
  }
  return { name, ext };
};

// change the filename's extension to the new one.
// if there is no extension, add it.
exports.change_filename_extension = function(name, new_ext) {
  let ext;
  ({ name, ext } = exports.separate_file_extension(name));
  return `${name}.${new_ext}`;
};

// shallow copy of a map
exports.copy = function(obj) {
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
exports.copy_without = function(obj, without) {
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
exports.copy_with = function(obj, w) {
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
exports.deep_copy = function(obj) {
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
exports.path_split = function(path) {
  const v = path.split("/");
  return { head: v.slice(0, -1).join("/"), tail: v[v.length - 1] };
};

// Takes parts to a path and intelligently merges them on '/'.
// Continuous non-'/' portions of each part will have at most
// one '/' on either side.
// Each part will have exactly one '/' between it and adjacent parts
// Does NOT resolve up-level references
// See misc-tests for examples.
exports.normalized_path_join = function(...parts) {
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

// Takes a path string and file name and gives the full path to the file
exports.path_to_file = function(path, file, line_number) {
  if (path === "") {
    return file;
  }
  path = path + "/" + file;
  if (!line_number) {
    return path;
  }
  //path += "#L#{line_number}" # TODO: THIS IS BROKEN IN PRODUCTION FOR SOME REASON!!!!!
  return path;
};

exports.meta_file = function(path, ext) {
  if (path == null) {
    return;
  }
  const p = exports.path_split(path);
  path = p.head;
  if (p.head !== "") {
    path += "/";
  }
  return path + "." + p.tail + ".sage-" + ext;
};

// Given a path of the form foo/bar/.baz.ext.something returns foo/bar/baz.ext.
// For example:
//    .example.ipynb.sage-jupyter --> example.ipynb
//    tmp/.example.ipynb.sage-jupyter --> tmp/example.ipynb
//    .foo.txt.sage-chat --> foo.txt
//    tmp/.foo.txt.sage-chat --> tmp/foo.txt

exports.original_path = function(path) {
  const s = exports.path_split(path);
  if (s.tail[0] !== "." || s.tail.indexOf(".sage-") === -1) {
    return path;
  }
  const ext = exports.filename_extension(s.tail);
  let x = s.tail.slice(
    s.tail[0] === "." ? 1 : 0,
    s.tail.length - (ext.length + 1)
  );
  if (s.head !== "") {
    x = s.head + "/" + x;
  }
  return x;
};

const ELLIPSES = "…";
// "foobar" --> "foo…"
exports.trunc = function(s, max_length) {
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
exports.trunc_middle = function(s, max_length) {
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
exports.trunc_left = function(s, max_length) {
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

exports.pad_left = function(s, n) {
  if (!typeof s === "string") {
    s = `${s}`;
  }
  for (
    let i = s.length, end = n, asc = s.length <= end;
    asc ? i < end : i > end;
    asc ? i++ : i--
  ) {
    s = ` ${s}`;
  }
  return s;
};

exports.pad_right = function(s, n) {
  if (!typeof s === "string") {
    s = `${s}`;
  }
  for (
    let i = s.length, end = n, asc = s.length <= end;
    asc ? i < end : i > end;
    asc ? i++ : i--
  ) {
    s += " ";
  }
  return s;
};

// gives the plural form of the word if the number should be plural
exports.plural = function(number, singular, plural) {
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

exports.git_author = (first_name, last_name, email_address) =>
  `${first_name} ${last_name} <${email_address}>`;

const reValidEmail = (function() {
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

exports.is_valid_email_address = function(email) {
  // From http://stackoverflow.com/questions/46155/validate-email-address-in-javascript
  // but converted to Javascript; it's near the middle but claims to be exactly RFC822.
  if (reValidEmail.test(email)) {
    return true;
  } else {
    return false;
  }
};

// More canonical email address -- lower case and remove stuff between + and @.
// This is mainly used for banning users.

exports.canonicalize_email_address = function(email_address) {
  if (typeof email_address !== "string") {
    // silly, but we assume it is a string, and I'm concerned about a hacker attack involving that
    email_address = JSON.stringify(email_address);
  }
  // remove + part from email address:   foo+bar@example.com
  const i = email_address.indexOf("+");
  if (i !== -1) {
    const j = email_address.indexOf("@");
    if (j !== -1) {
      email_address = email_address.slice(0, i) + email_address.slice(j);
    }
  }
  // make email address lower case
  return email_address.toLowerCase();
};

exports.lower_email_address = function(email_address) {
  if (email_address == null) {
    return;
  }
  if (typeof email_address !== "string") {
    // silly, but we assume it is a string, and I'm concerned about a hacker attack involving that
    email_address = JSON.stringify(email_address);
  }
  // make email address lower case
  return email_address.toLowerCase();
};

// Parses a string reresenting a search of users by email or non-email
// Expects the string to be delimited by commas or semicolons
//   between multiple users
//
// Non-email strings are ones without an '@' and will be split on whitespace
//
// Emails may be wrapped by angle brackets.
//   ie. <name@email.com> is valid and understood as name@email.com
//   (Note that <<name@email.com> will be <name@email.com which is not valid)
// Emails must be legal as specified by RFC822
//
// returns an object with the queries in lowercase
// eg.
// {
//    string_queries: ["firstname", "lastname", "somestring"]
//    email_queries: ["email@something.com", "justanemail@mail.com"]
// }
exports.parse_user_search = function(query) {
  const r = { string_queries: [], email_queries: [] };
  if (typeof query !== "string") {
    return r;
  }
  const queries = Array.from(
    query
      .split("\n")
      .map(q1 => q1.split(/,|;/))
      .reduce((acc, val) => acc.concat(val), []) // flatten
      .map(q => q.trim().toLowerCase())
  );
  const email_re = /<(.*)>/;
  for (let x of Array.from(queries)) {
    if (x) {
      // Is not an email
      if (x.indexOf("@") === -1) {
        r.string_queries.push(x.split(/\s+/g));
      } else {
        // extract just the email address out
        for (let a of Array.from(exports.split(x))) {
          // Ensures that we don't throw away emails like
          // "<validEmail>"withquotes@mail.com
          if (a[0] === "<") {
            const match = email_re.exec(a);
            a =
              (match != null ? match[1] : undefined) != null
                ? match != null
                  ? match[1]
                  : undefined
                : a;
          }
          if (exports.is_valid_email_address(a)) {
            r.email_queries.push(a);
          }
        }
      }
    }
  }
  return r;
};

// Delete trailing whitespace in the string s.
exports.delete_trailing_whitespace = s => s.replace(/[^\S\n]+$/gm, "");

exports.assert = function(condition, mesg) {
  if (!condition) {
    if (typeof mesg === "string") {
      throw new Error(mesg);
    }
    throw mesg;
  }
};

exports.retry_until_success = function(opts) {
  let start_time;
  opts = exports.defaults(opts, {
    f: exports.required, // f((err) => )
    start_delay: 100, // milliseconds
    max_delay: 20000, // milliseconds -- stop increasing time at this point
    factor: 1.4, // multiply delay by this each time
    max_tries: undefined, // maximum number of times to call f
    max_time: undefined, // milliseconds -- don't call f again if the call would start after this much time from first call
    log: undefined,
    warn: undefined,
    name: "",
    cb: undefined
  }); // called with cb() on *success*; cb(error, last_error) if max_tries is exceeded

  let delta = opts.start_delay;
  let tries = 0;
  if (opts.max_time != null) {
    start_time = new Date();
  }
  var g = function() {
    tries += 1;
    if (opts.log != null) {
      if (opts.max_tries != null) {
        opts.log(
          `retry_until_success(${opts.name}) -- try ${tries}/${opts.max_tries}`
        );
      }
      if (opts.max_time != null) {
        opts.log(
          `retry_until_success(${
            opts.name
          }) -- try ${tries} (started ${new Date() -
            start_time}ms ago; will stop before ${opts.max_time}ms max time)`
        );
      }
      if (opts.max_tries == null && opts.max_time == null) {
        opts.log(`retry_until_success(${opts.name}) -- try ${tries}`);
      }
    }
    return opts.f(function(err) {
      if (err) {
        if (err === "not_public") {
          if (typeof opts.cb === "function") {
            opts.cb("not_public");
          }
          return;
        }
        if (err && opts.warn != null) {
          opts.warn(
            `retry_until_success(${opts.name}) -- err=${JSON.stringify(err)}`
          );
        }
        if (opts.log != null) {
          opts.log(
            `retry_until_success(${opts.name}) -- err=${JSON.stringify(err)}`
          );
        }
        if (opts.max_tries != null && opts.max_tries <= tries) {
          if (typeof opts.cb === "function") {
            opts.cb(
              `maximum tries (=${
                opts.max_tries
              }) exceeded - last error ${JSON.stringify(err)}`,
              err
            );
          }
          return;
        }
        delta = Math.min(opts.max_delay, opts.factor * delta);
        if (
          opts.max_time != null &&
          new Date() - start_time + delta > opts.max_time
        ) {
          if (typeof opts.cb === "function") {
            opts.cb(
              `maximum time (=${
                opts.max_time
              }ms) exceeded - last error ${JSON.stringify(err)}`,
              err
            );
          }
          return;
        }
        return setTimeout(g, delta);
      } else {
        if (opts.log != null) {
          opts.log(`retry_until_success(${opts.name}) -- success`);
        }
        return typeof opts.cb === "function" ? opts.cb() : undefined;
      }
    });
  };
  return g();
};

// Attempt (using exponential backoff) to execute the given function.
// Will keep retrying until it succeeds, then call "cb()".   You may
// call this multiple times and all callbacks will get called once the
// connection succeeds, since it keeps a stack of all cb's.
// The function f that gets called should make one attempt to do what it
// does, then on success do cb() and on failure cb(err).
// It must *NOT* call the RetryUntilSuccess callable object.
//
// Usage
//
//      @foo = retry_until_success_wrapper(f:@_foo)
//      @bar = retry_until_success_wrapper(f:@_foo, start_delay:100, max_delay:10000, exp_factor:1.5)
//
exports.retry_until_success_wrapper = function(opts) {
  const _X = new RetryUntilSuccess(opts);
  return cb => _X.call(cb);
};

class RetryUntilSuccess {
  constructor(opts) {
    this.call = this.call.bind(this);
    this.opts = exports.defaults(opts, {
      f: exports.defaults.required, // f(cb);  cb(err)
      start_delay: 100, // initial delay beforing calling f again.  times are all in milliseconds
      max_delay: 20000,
      exp_factor: 1.4,
      max_tries: undefined,
      max_time: undefined, // milliseconds -- don't call f again if the call would start after this much time from first call
      min_interval: 100, // if defined, all calls to f will be separated by *at least* this amount of time (to avoid overloading services, etc.)
      logname: undefined,
      verbose: false
    });
    if (this.opts.min_interval != null) {
      if (this.opts.start_delay < this.opts.min_interval) {
        this.opts.start_delay = this.opts.min_interval;
      }
    }
    this.f = this.opts.f;
  }

  call(cb, retry_delay) {
    let start_time;
    if (this.opts.logname != null) {
      console.debug(`${this.opts.logname}(... ${retry_delay})`);
    }

    if (this._cb_stack == null) {
      this._cb_stack = [];
    }
    if (cb != null) {
      this._cb_stack.push(cb);
    }
    if (this._calling) {
      return;
    }
    this._calling = true;
    if (retry_delay == null) {
      this.attempts = 0;
    }

    if (this.opts.logname != null) {
      console.debug(
        `actually calling -- ${this.opts.logname}(... ${retry_delay})`
      );
    }

    if (this.opts.max_time != null) {
      start_time = new Date();
    }

    const g = () => {
      if (this.opts.min_interval != null) {
        this._last_call_time = exports.mswalltime();
      }
      return this.f(err => {
        this.attempts += 1;
        this._calling = false;
        if (err) {
          if (this.opts.verbose) {
            console.debug(`${this.opts.logname}: error=${err}`);
          }
          if (
            this.opts.max_tries != null &&
            this.attempts >= this.opts.max_tries
          ) {
            while (this._cb_stack.length > 0) {
              this._cb_stack.pop()(err);
            }
            return;
          }
          if (retry_delay == null) {
            retry_delay = this.opts.start_delay;
          } else {
            retry_delay = Math.min(
              this.opts.max_delay,
              this.opts.exp_factor * retry_delay
            );
          }
          if (
            this.opts.max_time != null &&
            new Date() - start_time + retry_delay > this.opts.max_time
          ) {
            err = `maximum time (=${
              this.opts.max_time
            }ms) exceeded - last error ${err}`;
            while (this._cb_stack.length > 0) {
              this._cb_stack.pop()(err);
            }
            return;
          }
          const f = () => {
            return this.call(undefined, retry_delay);
          };
          return setTimeout(f, retry_delay);
        } else {
          return (() => {
            const result = [];
            while (this._cb_stack.length > 0) {
              result.push(this._cb_stack.pop()());
            }
            return result;
          })();
        }
      });
    };
    if (this._last_call_time == null || this.opts.min_interval == null) {
      return g();
    } else {
      const w = exports.mswalltime(this._last_call_time);
      if (w < this.opts.min_interval) {
        return setTimeout(g, this.opts.min_interval - w);
      } else {
        return g();
      }
    }
  }
}

// WARNING: params below have different semantics than above; these are what *really* make sense....
exports.eval_until_defined = function(opts) {
  opts = exports.defaults(opts, {
    code: exports.required,
    start_delay: 100, // initial delay beforing calling f again.  times are all in milliseconds
    max_time: 10000, // error if total time spent trying will exceed this time
    exp_factor: 1.4,
    cb: exports.required
  }); // cb(err, eval(code))
  let delay = undefined;
  let total = 0;
  var f = function() {
    const result = eval(opts.code);
    if (result != null) {
      return opts.cb(false, result);
    } else {
      if (delay == null) {
        delay = opts.start_delay;
      } else {
        delay *= opts.exp_factor;
      }
      total += delay;
      if (total > opts.max_time) {
        return opts.cb(`failed to eval code within ${opts.max_time}`);
      } else {
        return setTimeout(f, delay);
      }
    }
  };
  return f();
};

// An async debounce, kind of like the debounce in http://underscorejs.org/#debounce.
// Crucially, this async_debounce does NOT return a new function and store its state in a closure
// (like the maybe broken https://github.com/juliangruber/async-debounce), so we can use it for
// making async debounced methods in classes (see examples in SMC source code for how to do this).

// TODO: this is actually throttle, not debounce...

exports.async_debounce = function(opts) {
  opts = defaults(opts, {
    f: required, // async function f whose *only* argument is a callback
    interval: 1500, // call f at most this often (in milliseconds)
    state: required, // store state information about debounce in this *object*
    cb: undefined
  }); // as if f(cb) happens -- cb may be undefined.
  let { f, interval, state, cb } = opts;

  const call_again = function() {
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

  return f(err => {
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

// Class to use for mapping a collection of strings to characters (e.g., for use with diff/patch/match).
exports.StringCharMapping = class StringCharMapping {
  constructor(opts) {
    let ch, st;
    this._find_next_char = this._find_next_char.bind(this);
    this.to_string = this.to_string.bind(this);
    this.to_array = this.to_array.bind(this);
    if (opts == null) {
      opts = {};
    }
    opts = exports.defaults(opts, {
      to_char: undefined,
      to_string: undefined
    });
    this._to_char = {};
    this._to_string = {};
    this._next_char = "A";
    if (opts.to_string != null) {
      for (ch in opts.to_string) {
        st = opts.to_string[ch];
        this._to_string[ch] = st;
        this._to_char[st] = ch;
      }
    }
    if (opts.to_char != null) {
      for (st in opts.to_char) {
        ch = opts.to_char[st];
        this._to_string[ch] = st;
        this._to_char[st] = ch;
      }
    }
    this._find_next_char();
  }

  _find_next_char() {
    return (() => {
      const result = [];
      while (true) {
        this._next_char = String.fromCharCode(
          this._next_char.charCodeAt(0) + 1
        );
        if (this._to_string[this._next_char] == null) {
          break;
        } else {
          result.push(undefined);
        }
      }
      return result;
    })();
  }

  to_string(strings) {
    let t = "";
    for (let s of Array.from(strings)) {
      const a = this._to_char[s];
      if (a != null) {
        t += a;
      } else {
        t += this._next_char;
        this._to_char[s] = this._next_char;
        this._to_string[this._next_char] = s;
        this._find_next_char();
      }
    }
    return t;
  }

  to_array(string) {
    return Array.from(string).map(s => this._to_string[s]);
  }
};

// Given a string s, return the string obtained by deleting all later duplicate characters from s.
exports.uniquify_string = function(s) {
  const seen_already = {};
  let t = "";
  for (let c of Array.from(s)) {
    if (seen_already[c] == null) {
      t += c;
      seen_already[c] = true;
    }
  }
  return t;
};

// Return string t=s+'\n'*k so that t ends in at least n newlines.
// Returns s itself (so no copy made) if s already ends in n newlines (a common case).
/* -- not used
exports.ensure_string_ends_in_newlines = (s, n) ->
    j = s.length-1
    while j >= 0 and j >= s.length-n and s[j] == '\n'
        j -= 1
    * Now either j = -1 or s[j] is not a newline (and it is the first character not a newline from the right).
    console.debug(j)
    k = n - (s.length - (j + 1))
    console.debug(k)
    if k == 0
        return s
    else
        return s + Array(k+1).join('\n')   # see http://stackoverflow.com/questions/1877475/repeat-character-n-times
*/

// Used in the database, etc., for different types of users of a project

exports.PROJECT_GROUPS = [
  "owner",
  "collaborator",
  "viewer",
  "invited_collaborator",
  "invited_viewer"
];

// turn an arbitrary string into a nice clean identifier that can safely be used in an URL
exports.make_valid_name = s =>
  // for now we just delete anything that isn't alphanumeric.
  // See http://stackoverflow.com/questions/9364400/remove-not-alphanumeric-characters-from-string-having-trouble-with-the-char/9364527#9364527
  // whose existence surprised me!
  s.replace(/\W/g, "_").toLowerCase();

// format is 2014-04-04-061502
exports.parse_bup_timestamp = function(s) {
  const v = [
    s.slice(0, 4),
    s.slice(5, 7),
    s.slice(8, 10),
    s.slice(11, 13),
    s.slice(13, 15),
    s.slice(15, 17),
    "0"
  ];
  return new Date(`${v[1]}/${v[2]}/${v[0]} ${v[3]}:${v[4]}:${v[5]} UTC`);
};

exports.matches = function(s, words) {
  for (let word of Array.from(words)) {
    if (s.indexOf(word) === -1) {
      return false;
    }
  }
  return true;
};

exports.hash_string = function(s) {
  if (s == null) {
    return;
  }
  // see http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
  let hash = 0;
  let i = undefined;
  let chr = undefined;
  let len = undefined;
  if (s.length === 0) {
    return hash;
  }
  i = 0;
  len = s.length;
  while (i < len) {
    chr = s.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // convert to 32-bit integer
    i++;
  }
  return hash;
};

exports.parse_hashtags = function(t) {
  // return list of pairs (i,j) such that t.slice(i,j) is a hashtag (starting with #).
  const v = [];
  if (t == null) {
    return v;
  }
  let base = 0;
  while (true) {
    let i = t.indexOf("#");
    if (i === -1 || i === t.length - 1) {
      return v;
    }
    base += i + 1;
    if (t[i + 1] === "#" || !(i === 0 || t[i - 1].match(/\s/))) {
      t = t.slice(i + 1);
      continue;
    }
    t = t.slice(i + 1);
    // find next whitespace or non-alphanumeric or dash
    // TODO: this lines means hashtags must be US ASCII --
    //    see http://stackoverflow.com/questions/1661197/valid-characters-for-javascript-variable-names
    i = t.match(/\s|[^A-Za-z0-9_\-]/);
    if (i) {
      i = i.index;
    } else {
      i = -1;
    }
    if (i === 0) {
      // hash followed immediately by whitespace -- markdown desc
      base += i + 1;
      t = t.slice(i + 1);
    } else {
      // a hash tag
      if (i === -1) {
        // to the end
        v.push([base - 1, base + t.length]);
        return v;
      } else {
        v.push([base - 1, base + i]);
        base += i + 1;
        t = t.slice(i + 1);
      }
    }
  }
};

// see http://docs.mathjax.org/en/latest/tex.html#environments
const mathjax_environments = [
  "align",
  "align*",
  "alignat",
  "alignat*",
  "aligned",
  "alignedat",
  "array",
  "Bmatrix",
  "bmatrix",
  "cases",
  "CD",
  "eqnarray",
  "eqnarray*",
  "equation",
  "equation*",
  "gather",
  "gather*",
  "gathered",
  "matrix",
  "multline",
  "multline*",
  "pmatrix",
  "smallmatrix",
  "split",
  "subarray",
  "Vmatrix",
  "vmatrix"
];
const mathjax_delim = [["$$", "$$"], ["\\(", "\\)"], ["\\[", "\\]"]];
for (let env of Array.from(mathjax_environments)) {
  mathjax_delim.push([`\\begin{${env}}`, `\\end{${env}}`]);
}
mathjax_delim.push(["$", "$"]); // must be after $$, best to put it at the end

exports.parse_mathjax = function(t) {
  // Return list of pairs (i,j) such that t.slice(i,j) is a mathjax, including delimiters.
  // The delimiters are given in the mathjax_delim list above.
  const v = [];
  if (t == null) {
    return v;
  }
  let i = 0;
  while (i < t.length) {
    // escaped dollar sign, ignored
    if (t.slice(i, i + 2) === "\\$") {
      i += 2;
      continue;
    }
    for (let d of Array.from(mathjax_delim)) {
      let contains_linebreak = false;
      // start of a formula detected
      if (t.slice(i, i + d[0].length) === d[0]) {
        // a match -- find the close
        let j = i + 1;
        while (j < t.length && t.slice(j, j + d[1].length) !== d[1]) {
          const next_char = t.slice(j, j + 1);
          if (next_char === "\n") {
            contains_linebreak = true;
            if (d[0] === "$") {
              break;
            }
          }
          // deal with ending ` char in markdown (mathjax doesn't stop there)
          const prev_char = t.slice(j - 1, j);
          if (next_char === "`" && prev_char !== "\\") {
            // implicitly also covers "```"
            j -= 1; // backtrack one step
            break;
          }
          j += 1;
        }
        j += d[1].length;
        // filter out the case, where there is just one $ in one line (e.g. command line, USD, ...)
        const at_end_of_string = j > t.length;
        if (!(d[0] === "$" && (contains_linebreak || at_end_of_string))) {
          v.push([i, j]);
        }
        i = j;
        break;
      }
    }
    i += 1;
  }
  return v;
};

// If you're going to set some innerHTML then mathjax it,
exports.mathjax_escape = html =>
  html
    .replace(/&(?!#?\w+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Return true if (1) path is contained in one
// of the given paths (a list of strings) -- or path without
// zip extension is in paths.
// Always returns false if path is undefined/null (since that might be dangerous, right)?
exports.path_is_in_public_paths = (path, paths) =>
  exports.containing_public_path(path, paths) != null;

// returns a string in paths if path is public because of that string
// Otherwise, returns undefined.
// IMPORTANT: a possible returned string is "", which is falsey but defined!
// paths can be an array or object (with keys the paths) or a Set
exports.containing_public_path = function(path, paths) {
  let p;
  if (paths == null || path == null) {
    return;
  }
  if (path.indexOf("../") !== -1) {
    // just deny any potentially trickiery involving relative path segments (TODO: maybe too restrictive?)
    return;
  }
  if (is_array(paths) || is_set(paths)) {
    // array so "of"
    for (p of Array.from(paths)) {
      if (p === "") {
        // the whole project is public, which matches everything
        return "";
      }
      if (path === p) {
        // exact match
        return p;
      }
      if (path.slice(0, p.length + 1) === p + "/") {
        return p;
      }
    }
  } else if (is_object(paths)) {
    for (p in paths) {
      // object and want keys, so *of*
      if (p === "") {
        // the whole project is public, which matches everything
        return "";
      }
      if (path === p) {
        // exact match
        return p;
      }
      if (path.slice(0, p.length + 1) === p + "/") {
        return p;
      }
    }
  } else {
    throw Error("paths must be undefined, an array, or a map");
  }
  if (exports.filename_extension(path) === "zip") {
    // is path something_public.zip ?
    return exports.containing_public_path(
      path.slice(0, path.length - 4),
      paths
    );
  }
  return undefined;
};

// encode a UNIX path, which might have # and % in it.
// Maybe alternatively, (encodeURIComponent(p) for p in path.split('/')).join('/') ?
exports.encode_path = function(path) {
  path = encodeURI(path); // doesn't escape # and ?, since they are special for urls (but not unix paths)
  return path.replace(/#/g, "%23").replace(/\?/g, "%3F");
};

// This adds a method _call_with_lock to obj, which makes it so it's easy to make it so only
// one method can be called at a time of an object -- all calls until completion
// of the first one get an error.

exports.call_lock = function(opts) {
  opts = exports.defaults(opts, {
    obj: exports.required,
    timeout_s: 30
  }); // lock expire timeout after this many seconds

  const { obj } = opts;

  obj._call_lock = function() {
    obj.__call_lock = true;
    obj.__call_lock_timeout = function() {
      obj.__call_lock = false;
      return delete obj.__call_lock_timeout;
    };
    return setTimeout(obj.__call_lock_timeout, opts.timeout_s * 1000);
  };

  obj._call_unlock = function() {
    if (obj.__call_lock_timeout != null) {
      clearTimeout(obj.__call_lock_timeout);
      delete obj.__call_lock_timeout;
    }
    return (obj.__call_lock = false);
  };

  return (obj._call_with_lock = function(f, cb) {
    if (obj.__call_lock) {
      if (typeof cb === "function") {
        cb("error -- hit call_lock");
      }
      return;
    }
    obj._call_lock();
    return f(function(...args) {
      obj._call_unlock();
      return typeof cb === "function"
        ? cb(...Array.from(args || []))
        : undefined;
    });
  });
};

// "Performs an optimized deep comparison between the two objects, to determine if they should be considered equal."
exports.is_equal = underscore.isEqual;

exports.cmp = function(a, b) {
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  }
  return 0;
};

exports.cmp_array = function(a, b) {
  for (
    let i = 0, end = Math.max(a.length, b.length), asc = 0 <= end;
    asc ? i < end : i > end;
    asc ? i++ : i--
  ) {
    const c = exports.cmp(a[i], b[i]);
    if (c) {
      return c;
    }
  }
  return 0;
};

exports.cmp_Date = function(a, b) {
  if (a == null) {
    return -1;
  }
  if (b == null) {
    return 1;
  }
  return exports.cmp(a.valueOf(), b.valueOf());
};

exports.timestamp_cmp = function(a, b, field) {
  if (field == null) {
    field = "timestamp";
  }
  return -exports.cmp_Date(a[field], b[field]);
};

const timestamp_cmp0 = function(a, b, field) {
  if (field == null) {
    field = "timestamp";
  }
  return exports.cmp_Date(a[field], b[field]);
};

exports.field_cmp = field => (a, b) => exports.cmp(a[field], b[field]);

// Return true if and only if a[field] != b[field] for some field.
// Here we literally just use !=, so do not use this for non-atomic values!
exports.is_different = function(a, b, fields, why) {
  let field;
  if (a == null) {
    if (b == null) {
      return false; // they are the same
    }
    // a not defined but b is
    for (field of Array.from(fields)) {
      if (b[field] != null) {
        if (why) {
          console.log(
            "is_different",
            field,
            a != null ? a[field] : undefined,
            b[field]
          );
        }
        return true;
      }
    }
    return false;
  }
  if (b == null) {
    // a is defined or would be handled above
    for (field of Array.from(fields)) {
      if (a[field] != null) {
        if (why) {
          console.log(
            "is_different",
            field,
            a[field],
            b != null ? b[field] : undefined
          );
        }
        return true; // different
      }
    }
    return false; // same
  }

  for (field of Array.from(fields)) {
    if (a[field] !== b[field]) {
      if (why) {
        console.log("is_different", field, a[field], b[field]);
      }
      return true;
    }
  }
  return false;
};

exports.is_different_array = (a, b) => !underscore.isEqual(a, b);

//####################
// temporary location for activity_log code, shared by front and backend.
//####################

class ActivityLog {
  constructor(opts) {
    this.obj = this.obj.bind(this);
    this.path = this.path.bind(this);
    this.process = this.process.bind(this);
    this._process_event = this._process_event.bind(this);
    opts = exports.defaults(opts, {
      events: undefined,
      account_id: exports.required, // user
      notifications: {}
    });
    this.notifications = opts.notifications;
    this.account_id = opts.account_id;
    if (opts.events != null) {
      this.process(opts.events);
    }
  }

  obj() {
    return { notifications: this.notifications, account_id: this.account_id };
  }

  path(e) {
    return `${e.project_id}/${e.path}`;
  }

  process(events) {
    //t0 = exports.mswalltime()
    let events_with_path;
    const by_path = {};
    for (let e of Array.from(events)) {
      //#if e.account_id == @account_id  # ignore our own events
      //#    continue
      const key = this.path(e);
      events_with_path = by_path[key];
      if (events_with_path == null) {
        events_with_path = by_path[key] = [e];
      } else {
        events_with_path.push(e);
      }
    }
    return (() => {
      const result = [];
      for (var path in by_path) {
        events_with_path = by_path[path];
        events_with_path.sort(timestamp_cmp0); // oldest to newest
        result.push(
          Array.from(events_with_path).map(event =>
            this._process_event(event, path)
          )
        );
      }
      return result;
    })();
  }
  //winston.debug("ActivityLog: processed #{events.length} in #{exports.mswalltime(t0)}ms")

  _process_event(event, path) {
    // process the given event, assuming all older events have been
    // processed already; this updates the notifications object.
    if (path == null) {
      path = this.path(event);
    }
    let a = this.notifications[path];
    if (a == null) {
      this.notifications[path] = a = {};
    }
    a.timestamp = event.timestamp;
    a.id = event.id;
    //console.debug("process_event", event, path)
    //console.debug(event.seen_by?.indexOf(@account_id))
    //console.debug(event.read_by?.indexOf(@account_id))
    if (
      event.seen_by != null &&
      event.seen_by.indexOf(this.account_id) !== -1
    ) {
      a.seen = event.timestamp;
    }
    if (
      event.read_by != null &&
      event.read_by.indexOf(this.account_id) !== -1
    ) {
      a.read = event.timestamp;
    }

    if (event.action != null) {
      let who = a[event.action];
      if (who == null) {
        who = a[event.action] = {};
      }
      return (who[event.account_id] = event.timestamp);
    }
  }
}
// The code below (instead of the line above) would include *all* times.
// I'm not sure whether or not I want to use that information, since it
// could get really big.
//times = who[event.account_id]
//if not times?
//    times = who[event.account_id] = []
//times.push(event.timestamp)

exports.activity_log = opts => new ActivityLog(opts);

// see http://stackoverflow.com/questions/1144783/replacing-all-occurrences-of-a-string-in-javascript
exports.replace_all = (string, search, replace) =>
  string.split(search).join(replace);

// Similar to misc.replace_all, except it takes as input a function replace_f, which
// returns what to replace the i-th copy of search in string with.
exports.replace_all_function = function(string, search, replace_f) {
  const v = string.split(search);
  const w = [];
  for (
    let i = 0, end = v.length, asc = 0 <= end;
    asc ? i < end : i > end;
    asc ? i++ : i--
  ) {
    w.push(v[i]);
    if (i < v.length - 1) {
      w.push(replace_f(i));
    }
  }
  return w.join("");
};

exports.remove_c_comments = function(s) {
  while (true) {
    const i = s.indexOf("/*");
    if (i === -1) {
      return s;
    }
    const j = s.indexOf("*/");
    if (i >= j) {
      return s;
    }
    s = s.slice(0, i) + s.slice(j + 2);
  }
};

exports.date_to_snapshot_format = function(d) {
  if (d == null) {
    d = 0;
  }
  if (typeof d === "number") {
    d = new Date(d);
  }
  let s = d.toJSON();
  s = s.replace("T", "-").replace(/:/g, "");
  const i = s.lastIndexOf(".");
  return s.slice(0, i);
};

exports.stripe_date = d =>
  // https://github.com/sagemathinc/cocalc/issues/3254
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_negotiation
  new Date(d * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
// fixing the locale to en-US (to pass tests) and (not necessary, but just in case) also the time zone
//return new Date(d*1000).toLocaleDateString(
//    'en-US',
//        year: 'numeric'
//        month: 'long'
//        day: 'numeric'
//        weekday: "long"
//        timeZone: 'UTC'
//)

exports.to_money = n =>
  // see http://stackoverflow.com/questions/149055/how-can-i-format-numbers-as-money-in-javascript
  // TODO: replace by using react-intl...
  n.toFixed(2).replace(/(\d)(?=(\d{3})+\.)/g, "$1,");

exports.stripe_amount = function(units, currency) {
  // input is in pennies
  if (currency !== "usd") {
    throw Error(`not-implemented currency ${currency}`);
  }
  let s = `$${exports.to_money(units / 100)}`;
  if (s.slice(s.length - 3) === ".00") {
    s = s.slice(0, s.length - 3);
  }
  return s;
};

exports.capitalize = function(s) {
  if (s != null) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
};

exports.is_array = is_array = obj =>
  Object.prototype.toString.call(obj) === "[object Array]";

exports.is_integer = Number.isInteger;
if (exports.is_integer == null) {
  exports.is_integer = n => typeof n === "number" && n % 1 === 0;
}

exports.is_string = obj => typeof obj === "string";

// An object -- this is more constraining that typeof(obj) == 'object', e.g., it does
// NOT include Date.
exports.is_object = is_object = obj =>
  Object.prototype.toString.call(obj) === "[object Object]";

exports.is_set = is_set = obj =>
  Object.prototype.toString.call(obj) === "[object Set]";

exports.is_date = is_date = obj => obj instanceof Date;

// get a subarray of all values between the two given values inclusive, provided in either order
exports.get_array_range = function(arr, value1, value2) {
  let index1 = arr.indexOf(value1);
  let index2 = arr.indexOf(value2);
  if (index1 > index2) {
    [index1, index2] = Array.from([index2, index1]);
  }
  return arr.slice(index1, +index2 + 1 || undefined);
};

// Specific, easy to read: describe amount of time before right now
// Use negative input for after now (i.e., in the future).
exports.milliseconds_ago = ms => new Date(new Date() - ms);
exports.seconds_ago = s => exports.milliseconds_ago(1000 * s);
exports.minutes_ago = m => exports.seconds_ago(60 * m);
exports.hours_ago = h => exports.minutes_ago(60 * h);
exports.days_ago = d => exports.hours_ago(24 * d);
exports.weeks_ago = w => exports.days_ago(7 * w);
exports.months_ago = m => exports.days_ago(30.5 * m);

if (typeof window !== "undefined" && window !== null) {
  // BROWSER Versions of the above, but give the relevant point in time but
  // on the *server*.  These are only available in the web browser.
  exports.server_time = function() {
    let left;
    return new Date(
      new Date() -
        parseFloat(
          (left = exports.get_local_storage("clock_skew")) != null ? left : 0
        )
    );
  };
  exports.server_milliseconds_ago = function(ms) {
    let left;
    return new Date(
      new Date() -
        ms -
        parseFloat(
          (left = exports.get_local_storage("clock_skew")) != null ? left : 0
        )
    );
  };
  exports.server_seconds_ago = s => exports.server_milliseconds_ago(1000 * s);
  exports.server_minutes_ago = m => exports.server_seconds_ago(60 * m);
  exports.server_hours_ago = h => exports.server_minutes_ago(60 * h);
  exports.server_days_ago = d => exports.server_hours_ago(24 * d);
  exports.server_weeks_ago = w => exports.server_days_ago(7 * w);
  exports.server_months_ago = m => exports.server_days_ago(30.5 * m);
} else {
  // On the server, these functions are aliased to the functions above, since
  // we assume that the server clocks are sufficiently accurate.  Providing
  // these functions makes it simpler to write code that runs on both the
  // frontend and the backend.
  exports.server_time = () => new Date();
  exports.server_milliseconds_ago = exports.milliseconds_ago;
  exports.server_seconds_ago = exports.seconds_ago;
  exports.server_minutes_ago = exports.minutes_ago;
  exports.server_hours_ago = exports.hours_ago;
  exports.server_days_ago = exports.days_ago;
  exports.server_weeks_ago = exports.weeks_ago;
  exports.server_months_ago = exports.months_ago;
}

// Specific easy to read and describe point in time before another point in time tm.
// (The following work exactly as above if the second argument is excluded.)
// Use negative input for first argument for that amount of time after tm.
exports.milliseconds_before = (ms, tm) =>
  new Date((tm != null ? tm : new Date()) - ms);
exports.seconds_before = (s, tm) => exports.milliseconds_before(1000 * s, tm);
exports.minutes_before = (m, tm) => exports.seconds_before(60 * m, tm);
exports.hours_before = (h, tm) => exports.minutes_before(60 * h, tm);
exports.days_before = (d, tm) => exports.hours_before(24 * d, tm);
exports.weeks_before = (d, tm) => exports.days_before(7 * d, tm);
exports.months_before = (d, tm) => exports.days_before(30.5 * d, tm);

// time this many seconds in the future (or undefined)
exports.expire_time = function(s) {
  if (s) {
    return new Date(new Date() - 0 + s * 1000);
  }
};

exports.YEAR = new Date().getFullYear();

// Round the given number to 1 decimal place
exports.round1 = round1 = num => Math.round(num * 10) / 10;

// Round given number to 2 decimal places
exports.round2 = round2 = num =>
  // padding to fix floating point issue (see http://stackoverflow.com/questions/11832914/round-to-at-most-2-decimal-places-in-javascript)
  Math.round((num + 0.00001) * 100) / 100;

const seconds2hms_days = function(d, h, m, longform) {
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
exports.seconds2hms = seconds2hms = function(secs, longform, show_seconds) {
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

// returns the number parsed from the input text, or undefined if invalid
// rounds to the nearest 0.01 if round_number is true (default : true)
// allows negative numbers if allow_negative is true (default : false)
exports.parse_number_input = function(input, round_number, allow_negative) {
  let val;
  if (round_number == null) {
    round_number = true;
  }
  if (allow_negative == null) {
    allow_negative = false;
  }
  input = (input + "").split("/");
  if (input.length !== 1 && input.length !== 2) {
    return undefined;
  }
  if (input.length === 2) {
    val = parseFloat(input[0]) / parseFloat(input[1]);
  }
  if (input.length === 1) {
    if (isNaN(input) || `${input}`.trim() === "") {
      // Shockingly, whitespace returns false for isNaN!
      return undefined;
    }
    val = parseFloat(input);
  }
  if (round_number) {
    val = round2(val);
  }
  if (isNaN(val) || val === Infinity || (val < 0 && !allow_negative)) {
    return undefined;
  }
  return val;
};

exports.range = function(n, m) {
  if (m == null) {
    return __range__(0, n, false);
  } else {
    return __range__(n, m, false);
  }
};

// arithmetic of maps with codomain numbers; missing values default to 0
exports.map_sum = function(a, b) {
  let v;
  if (a == null) {
    return b;
  }
  if (b == null) {
    return a;
  }
  const c = {};
  for (var k in a) {
    v = a[k];
    c[k] = v + (b[k] != null ? b[k] : 0);
  }
  for (k in b) {
    v = b[k];
    if (c[k] == null) {
      c[k] = v;
    }
  }
  return c;
};

exports.map_diff = function(a, b) {
  let c, k, v;
  if (b == null) {
    return a;
  }
  if (a == null) {
    c = {};
    for (k in b) {
      v = b[k];
      c[k] = -v;
    }
    return c;
  }
  c = {};
  for (k in a) {
    v = a[k];
    c[k] = v - (b[k] != null ? b[k] : 0);
  }
  for (k in b) {
    v = b[k];
    if (c[k] == null) {
      c[k] = -v;
    }
  }
  return c;
};

// compare the values in a map a by the values of b
// or just by b if b is a number, using func(a, b)
map_comp_fn = function(func, fallback) {
  return (a, b) => {
    const c = {};
    if (typeof b === "number") {
      for (let k in a) {
        let v = a[k];
        c[k] = func(v, b);
      }
    } else {
      for (let k in a) {
        let v = a[k];
        c[k] = func(v, b[k] != null ? b[k] : fallback);
      }
    }
    return c;
  };
};

exports.map_limit = exports.map_min = map_comp_fn(Math.min, Number.MAX_VALUE);
exports.map_max = map_comp_fn(Math.max, Number.MIN_VALUE);

// arithmetic sum of an array
exports.sum = function(arr, start) {
  if (start == null) {
    start = 0;
  }
  return underscore.reduce(arr, (a, b) => a + b, start);
};

// replace map in place by the result of applying f to each
// element of the codomain of the map.  Also return the modified map.
exports.apply_function_to_map_values = apply_function_to_map_values = function(
  map,
  f
) {
  for (let k in map) {
    const v = map[k];
    map[k] = f(v);
  }
  return map;
};

// modify map by coercing each element of codomain to a number, with false->0 and true->1
exports.coerce_codomain_to_numbers = map =>
  apply_function_to_map_values(map, function(x) {
    if (typeof x === "boolean") {
      if (x) {
        return 1;
      } else {
        return 0;
      }
    } else {
      return parseFloat(x);
    }
  });

// returns true if the given map is undefined or empty, or all the values are falsy
exports.is_zero_map = function(map) {
  if (map == null) {
    return true;
  }
  for (let k in map) {
    const v = map[k];
    if (v) {
      return false;
    }
  }
  return true;
};

// Returns copy of map with no undefined/null values (recursive).
// Doesn't modify map.  If map is an array, just returns it
// with no change even if it has undefined values.
exports.map_without_undefined = map_without_undefined = function(map) {
  if (map == null) {
    return;
  }
  if (is_array(map)) {
    return map;
  }
  const new_map = {};
  for (let k in map) {
    const v = map[k];
    if (v == null) {
      continue;
    } else {
      new_map[k] = is_object(v) ? map_without_undefined(v) : v;
    }
  }
  return new_map;
};

exports.map_mutate_out_undefined = map =>
  (() => {
    const result = [];
    for (let k in map) {
      const v = map[k];
      if (v == null) {
        result.push(delete map[k]);
      } else {
        result.push(undefined);
      }
    }
    return result;
  })();

// foreground; otherwise, return false.
exports.should_open_in_foreground = function(e) {
  // for react.js synthetic mouse events, where e.which is undefined!
  if (e.constructor.name === "SyntheticMouseEvent") {
    e = e.nativeEvent;
  }
  //console.log("e: #{e}, e.which: #{e.which}", e)
  return !(e.which === 2 || e.metaKey || e.altKey || e.ctrlKey);
};

// Like Python's enumerate
exports.enumerate = function(v) {
  let i = 0;
  const w = [];
  for (let x of Array.from(v)) {
    w.push([i, x]);
    i += 1;
  }
  return w;
};

// escape everything in a regex
exports.escapeRegExp = escapeRegExp = str =>
  str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");

// smiley-fication of an arbitrary string
const smileys_definition = [
  [":-)", "😁"],
  [":-(", "😞"],
  ["<3", "♡", null, "\\b"],
  [":shrug:", "¯\\\\_(ツ)_/¯"],
  ["o_o", "סּ_סּ", "\\b", "\\b"],
  [":-p", "😛", null, "\\b"],
  [">_<", "😆"],
  ["^^", "😄", "^", "S"],
  ["^^ ", "😄 "],
  [" ^^", " 😄"],
  [";-)", "😉"],
  ["-_-", "😔"],
  [":-\\", "😏"],
  [":omg:", "😱"]
];

const smileys = [];

for (let smiley of Array.from(smileys_definition)) {
  s = escapeRegExp(smiley[0]);
  if (smiley[2] != null) {
    s = smiley[2] + s;
  }
  if (smiley[3] != null) {
    s = s + smiley[3];
  }
  smileys.push([RegExp(s, "g"), smiley[1]]);
}

exports.smiley = function(opts) {
  opts = exports.defaults(opts, {
    s: exports.required,
    wrap: undefined
  });
  // de-sanitize possible sanitized characters
  s = opts.s.replace(/&gt;/g, ">").replace(/&lt;/g, "<");
  for (let subs of Array.from(smileys)) {
    let repl = subs[1];
    if (opts.wrap) {
      repl = opts.wrap[0] + repl + opts.wrap[1];
    }
    s = s.replace(subs[0], repl);
  }
  return s;
};

_ = underscore;

exports.smiley_strings = () =>
  _.filter(
    _.map(smileys_definition, _.first),
    x => !_.contains(["^^ ", " ^^"], x)
  );

// converts an array to a "human readable" array
exports.to_human_list = function(arr) {
  arr = _.map(arr, x => x.toString());
  if (arr.length > 1) {
    return arr.slice(0, -1).join(", ") + " and " + arr.slice(-1);
  } else if (arr.length === 1) {
    return arr[0].toString();
  } else {
    return "";
  }
};

exports.emoticons = exports.to_human_list(exports.smiley_strings());

exports.history_path = function(path) {
  const p = exports.path_split(path);
  if (p.head) {
    return `${p.head}/.${p.tail}.sage-history`;
  } else {
    return `.${p.tail}.sage-history`;
  }
};

// This is a convenience function to provide as a callback when working interactively.
const _done = function(n, ...args) {
  const start_time = new Date();
  const f = function(...args) {
    if (n !== 1) {
      try {
        args = [JSON.stringify(args, null, n)];
      } catch (error) {}
    }
    // do nothing
    return console.log(
      `*** TOTALLY DONE! (${(new Date() - start_time) / 1000}s since start) `,
      ...Array.from(args)
    );
  };
  if (args.length > 0) {
    return f(...Array.from(args || []));
  } else {
    return f;
  }
};

exports.done = (...args) => _done(0, ...Array.from(args));
exports.done1 = (...args) => _done(1, ...Array.from(args));
exports.done2 = (...args) => _done(2, ...Array.from(args));

let smc_logger_timestamp = (smc_logger_timestamp_last = smc_start_time =
  new Date().getTime() / 1000.0);

exports.get_start_time_ts = () => new Date(smc_start_time * 1000);

exports.get_uptime = () =>
  seconds2hms(new Date().getTime() / 1000.0 - smc_start_time);

exports.log = function() {
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

exports.wrap_log = function() {
  if (
    !exports.RUNNING_IN_NODE &&
    (typeof window !== "undefined" && window !== null)
  ) {
    window.console.log_original = window.console.log;
    return (window.console.log = exports.log);
  }
};

// to test exception handling
exports.this_fails = () => exports.op_to_function("noop");

// derive the console initialization filename from the console's filename
// used in webapp and console_server_child
exports.console_init_filename = function(fn) {
  const x = exports.path_split(fn);
  x.tail = `.${x.tail}.init`;
  if (x.head === "") {
    return x.tail;
  }
  return [x.head, x.tail].join("/");
};

exports.has_null_leaf = has_null_leaf = function(obj) {
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
exports.peer_grading = function(students, N) {
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
  students.forEach(s => (asmnt[s] = []));
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
      idx => s_random[(i + idx) % L]
    );
  }

  // sort each peer group by the order of the `student` input list
  for (let k in asmnt) {
    const v = asmnt[k];
    asmnt[k] = underscore.sortBy(v, s => students.indexOf(s));
  }
  return asmnt;
};

// demonstration of the above; for tests see misc-test.coffee
exports.peer_grading_demo = function(S, N) {
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
exports.ticket_id_to_ticket_url = tid =>
  `https://sagemathcloud.zendesk.com/requests/${tid}`;

// Checks if the string only makes sense (heuristically) as downloadable url
exports.is_only_downloadable = string =>
  string.indexOf("://") !== -1 || exports.startswith(string, "git@github.com");

exports.ensure_bound = function(x, min, max) {
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
exports.path_to_tab = name => `editor-${name}`;

// assumes a valid editor tab name...
// If invalid or undefined, returns undefined
exports.tab_to_path = function(name) {
  if (name != null && name.substring(0, 7) === "editor-") {
    return name.substring(7);
  }
};

// suggest a new filename when duplicating it
// 1. strip extension, split at '_' or '-' if it exists
// try to parse a number, if it works, increment it, etc.
exports.suggest_duplicate_filename = function(name) {
  let ext;
  ({ name, ext } = exports.separate_file_extension(name));
  const idx_dash = name.lastIndexOf("-");
  const idx_under = name.lastIndexOf("_");
  const idx = exports.max([idx_dash, idx_under]);
  let new_name = null;
  if (idx > 0) {
    const [prfx, ending] = Array.from([
      name.slice(0, idx + 1),
      name.slice(idx + 1)
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

// Wrapper around localStorage, so we can safely touch it without raising an
// exception if it is banned (like in some browser modes) or doesn't exist.
// See https://github.com/sagemathinc/cocalc/issues/237

exports.set_local_storage = function(key, val) {
  try {
    return (localStorage[key] = val);
  } catch (e) {
    return console.warn(`localStorage set error -- ${e}`);
  }
};

exports.get_local_storage = function(key) {
  try {
    return localStorage[key];
  } catch (e) {
    return console.warn(`localStorage get error -- ${e}`);
  }
};

exports.delete_local_storage = function(key) {
  try {
    return delete localStorage[key];
  } catch (e) {
    return console.warn(`localStorage delete error -- ${e}`);
  }
};

exports.has_local_storage = function() {
  try {
    const TEST = "__smc_test__";
    localStorage[TEST] = "x";
    delete localStorage[TEST];
    return true;
  } catch (e) {
    return false;
  }
};

exports.local_storage_length = function() {
  try {
    return localStorage.length;
  } catch (e) {
    return 0;
  }
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
exports.top_sort = function(DAG, opts) {
  if (opts == null) {
    opts = { omit_sources: false };
  }
  const { omit_sources } = opts;
  const source_names = [];
  let num_edges = 0;
  const data = {};

  // Ready the data for top sort
  for (let name in DAG) {
    const parents = DAG[name];
    if (data[name] == null) {
      data[name] = {};
    }
    const node = data[name];
    node.name = name;
    if (node.children == null) {
      node.children = [];
    }
    node.parent_set = {};
    for (let parent_name of Array.from(parents)) {
      node.parent_set[parent_name] = true; // include element in "parent_set" (see https://github.com/sagemathinc/cocalc/issues/1710)
      if (data[parent_name] == null) {
        data[parent_name] = {};
      }
      if (data[parent_name].children == null) {
        data[parent_name].children = [];
      }
      data[parent_name].children.push(node);
    }
    if (parents.length === 0) {
      source_names.push(name);
    } else {
      num_edges += parents.length;
    }
  }

  // Top sort! Non-recursive method since recursion is way slow in javascript
  const path = [];
  const num_sources = source_names.length;
  while (source_names.length > 0) {
    const curr_name = source_names.shift();
    path.push(curr_name);
    for (let child of Array.from(data[curr_name].children)) {
      delete child.parent_set[curr_name];
      num_edges -= 1;
      if (exports.len(child.parent_set) === 0) {
        source_names.push(child.name);
      }
    }
  }

  // Detect lack of sources
  if (num_sources === 0) {
    throw new Error("No sources were detected");
  }

  // Detect cycles
  if (num_edges !== 0) {
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
exports.create_dependency_graph = object => {
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
  underscore.map(arr_objects, object => {
    return underscore.mapObject(object, val => {
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

// Remove all whitespace from string s.
// see http://stackoverflow.com/questions/6623231/remove-all-white-spaces-from-text
exports.remove_whitespace = s => (s != null ? s.replace(/\s/g, "") : undefined);

exports.is_whitespace = s => (s != null ? s.trim().length : undefined) === 0;

exports.lstrip = s => (s != null ? s.replace(/^\s*/g, "") : undefined);

exports.rstrip = s => (s != null ? s.replace(/\s*$/g, "") : undefined);

// ORDER MATTERS! -- this gets looped over and searches happen -- so the 1-character ops must be last.
exports.operators = ["!=", "<>", "<=", ">=", "==", "<", ">", "="];

exports.op_to_function = function(op) {
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
  $.each(node.attributes, function() {
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

exports.human_readable_size = function(bytes) {
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
exports.jupyter_language_to_name = function(lang) {
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
exports.closest_kernel_match = function(name, kernel_list) {
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
    if (k == null) continue;  // This happened to Harald once when using the "mod sim py" custom image.
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
var compareVersionStrings = function(a, b) {
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
