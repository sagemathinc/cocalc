/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is a rewrite and SUCCESSOR to ./misc.js.

Each function is rethought from scratch, and we try to implement
it in a more modern ES 2018/Typescript/standard libraries approach.

**The exact behavior of functions may change from what is in misc.js!**
*/

export {
  async_debounce,
  StringCharMapping,
  uniquify_string,
  PROJECT_GROUPS,
  parse_bup_timestamp,
  matches,
  hash_string,
  parse_hashtags,
  parse_mathjax,
  mathjax_escape,
  path_is_in_public_paths,
  containing_public_path,
  call_lock,
  is_equal,
  cmp_array,
  timestamp_cmp,
  field_cmp,
  is_different_array,
  activity_log,
  replace_all_function,
  remove_c_comments,
  date_to_snapshot_format,
  stripe_date,
  to_money,
  stripe_amount,
  is_set,
  get_array_range,
  server_time,
  server_milliseconds_ago,
  server_seconds_ago,
  server_minutes_ago,
  server_hours_ago,
  server_days_ago,
  server_weeks_ago,
  server_months_ago,
  milliseconds_before,
  seconds_before,
  minutes_before,
  hours_before,
  days_before,
  weeks_before,
  months_before,
  expire_time,
  YEAR,
  round1,
  seconds2hm,
  seconds2hms,
  range,
  map_min,
  map_limit,
  map_max,
  sum,
  apply_function_to_map_values,
  is_zero_map,
  map_without_undefined,
  map_mutate_out_undefined,
  should_open_in_foreground,
  enumerate,
  escapeRegExp,
  smiley,
  smiley_strings,
  emoticons,
  done,
  done1,
  done2,
  get_start_time_ts,
  get_uptime,
  log,
  wrap_log,
  this_fails,
  console_init_filename,
  has_null_leaf,
  peer_grading,
  peer_grading_demo,
  ticket_id_to_ticket_url,
  is_only_downloadable,
  ensure_bound,
  path_to_tab,
  tab_to_path,
  suggest_duplicate_filename,
  set_local_storage,
  get_local_storage,
  has_local_storage,
  local_storage_length,
  top_sort,
  create_dependency_graph,
  bind_objects,
  remove_whitespace,
  is_whitespace,
  lstrip,
  rstrip,
  operators,
  op_to_function,
  obj_key_subs,
  sanitize_html_attributes,
  utm_keys,
  analytics_cookie_name,
  jupyter_language_to_name,
  closest_kernel_match,
} from "./misc-tmp";

import * as sha1 from "sha1";
export { sha1 };

import * as lodash from "lodash";
import { Moment } from "moment";
import * as getRandomValues from "get-random-values";

export const keys = lodash.keys;

import { required, defaults, types } from "./opts";
export { required, defaults, types };

interface SplittedPath {
  head: string;
  tail: string;
}

export function path_split(path: string): SplittedPath {
  const v = path.split("/");
  return { head: v.slice(0, -1).join("/"), tail: v[v.length - 1] };
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// turn an arbitrary string into a nice clean identifier that can safely be used in an URL
export function make_valid_name(s: string): string {
  // for now we just delete anything that isn't alphanumeric.
  // See http://stackoverflow.com/questions/9364400/remove-not-alphanumeric-characters-from-string-having-trouble-with-the-char/9364527#9364527
  // whose existence surprised me!
  return s.replace(/\W/g, "_").toLowerCase();
}

const filename_extension_re = /(?:\.([^.]+))?$/;
export function filename_extension(filename: string): string {
  const match = filename_extension_re.exec(filename);
  if (!match) {
    return "";
  }
  const ext = match[1];
  return (ext ? ext : "").toLowerCase();
}

export function filename_extension_notilde(filename: string): string {
  let ext = filename_extension(filename);
  while (ext && ext[ext.length - 1] === "~") {
    // strip tildes from the end of the extension -- put there by rsync --backup, and other backup systems in UNIX.
    ext = ext.slice(0, ext.length - 1);
  }
  return ext;
}

// If input name foo.bar, returns object {name:'foo', ext:'bar'}.
// If there is no . in input name, returns {name:name, ext:''}
export function separate_file_extension(
  name: string
): { name: string; ext: string } {
  const ext: string = filename_extension(name);
  if (ext !== "") {
    name = name.slice(0, name.length - ext.length - 1); // remove the ext and the .
  }
  return { name, ext };
}

// change the filename's extension to the new one.
// if there is no extension, add it.
export function change_filename_extension(
  path: string,
  new_ext: string
): string {
  const { name } = separate_file_extension(path);
  return `${name}.${new_ext}`;
}

// Takes parts to a path and intelligently merges them on '/'.
// Continuous non-'/' portions of each part will have at most
// one '/' on either side.
// Each part will have exactly one '/' between it and adjacent parts
// Does NOT resolve up-level references
// See misc-tests for examples.
export function normalized_path_join(...parts): string {
  const sep = "/";
  const replace = new RegExp(sep + "{1,}", "g");
  const result: string[] = [];
  for (let x of Array.from(parts)) {
    if (x != null && `${x}`.length > 0) {
      result.push(`${x}`);
    }
  }
  return result.join(sep).replace(replace, sep);
}

// Like Python splitlines.
// WARNING -- this is actually NOT like Python splitlines, since it just deletes whitespace lines. TODO: audit usage and fix.
export function splitlines(s: string): string[] {
  const r = s.match(/[^\r\n]+/g);
  return r ? r : [];
}

// Like Python's string split -- splits on whitespace
export function split(s: string): string[] {
  const r = s.match(/\S+/g);
  if (r) {
    return r;
  } else {
    return [];
  }
}

export function is_different(
  a: any,
  b: any,
  fields: string[],
  verbose?: string
): boolean {
  if (verbose != null) {
    return is_different_verbose(a, b, fields, verbose);
  }
  let field: string;
  if (a == null) {
    if (b == null) {
      return false; // they are the same
    }
    // a not defined but b is
    for (field of fields) {
      if (b[field] != null) {
        return true;
      }
    }
    return false;
  }
  if (b == null) {
    // a is defined or would be handled above
    for (field of fields) {
      if (a[field] != null) {
        return true; // different
      }
    }
    return false; // same
  }

  for (field of fields) {
    if (a[field] !== b[field]) {
      return true;
    }
  }
  return false;
}

// Use for debugging purposes only -- copy code from above to avoid making that
// code more complicated and possibly slower.
function is_different_verbose(
  a: any,
  b: any,
  fields: string[],
  verbose: string
): boolean {
  function log(...x) {
    console.log("is_different_verbose", verbose, ...x);
  }
  let field: string;
  if (a == null) {
    if (b == null) {
      log("both null");
      return false; // they are the same
    }
    // a not defined but b is
    for (field of fields) {
      if (b[field] != null) {
        log("a not defined but b is");
        return true;
      }
    }
    return false;
  }
  if (b == null) {
    // a is defined or would be handled above
    for (field of fields) {
      if (a[field] != null) {
        log(`b null and "${field}" of a is not null`);
        return true; // different
      }
    }
    return false; // same
  }

  for (field of fields) {
    if (a[field] !== b[field]) {
      log(`field "${field}" differs`, a[field], b[field]);
      return true;
    }
  }
  log("same");
  return false;
}

// Modifies in place the object dest so that it
// includes all values in objs and returns dest.
// This is a *shallow* copy.
// Rightmost object overwrites left.
export function merge(dest, ...objs) {
  for (const obj of objs) {
    for (const k in obj) {
      dest[k] = obj[k];
    }
  }
  return dest;
}

// Makes new object that is *shallow* copy merge of all objects.
export function merge_copy(...objs): object {
  return merge({}, ...Array.from(objs));
}

// copy of map but only with some keys
// I.e., restrict a function to a subset of the domain.
export function copy_with<T>(obj: T, w: string | string[]): Partial<T> {
  if (typeof w === "string") {
    w = [w];
  }
  const obj2: any = {};
  let key: string;
  for (key of w) {
    const y = obj[key];
    if (y !== undefined) {
      obj2[key] = y;
    }
  }
  return obj2;
}

// copy of map but without some keys
// I.e., restrict a function to the complement of a subset of the domain.
export function copy_without(obj: object, w: string | string[]): object {
  if (typeof w === "string") {
    w = [w];
  }
  const r = {};
  for (let key in obj) {
    const y = obj[key];
    if (!Array.from(w).includes(key)) {
      r[key] = y;
    }
  }
  return r;
}

import { cloneDeep } from "lodash";
export const deep_copy = cloneDeep;

// Very poor man's set.
export function set(v: string[]): { [key: string]: true } {
  const s: { [key: string]: true } = {};
  for (const x of v) {
    s[x] = true;
  }
  return s;
}

export function cmp(a: any, b: any): number {
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  }
  return 0;
}

/*
compare two Date | undefined | null objects.

null and undefined are considered equal to each other.

null_last:
  - true: nulls are infinitely in the future
  - false: nulls are the dawn of mankind
*/

export function cmp_Date(
  a: Date | undefined | null,
  b: Date | undefined | null,
  null_last = false
): -1 | 0 | 1 {
  if (a == null) {
    if (b == null) {
      return 0;
    }
    return null_last ? 1 : -1;
  }
  // a != null
  if (b == null) {
    return null_last ? -1 : 1;
  }
  if (a < b) return -1;
  if (a > b) return 1;
  return 0; // note: a == b for Date objects doesn't work as expected, but that's OK here.
}

export function cmp_moment(a?: Moment, b?: Moment, null_last = false) {
  return cmp_Date(a?.toDate(), b?.toDate(), null_last);
}

// see https://stackoverflow.com/questions/728360/how-do-i-correctly-clone-a-javascript-object/30042948#30042948
export function copy<T>(obj: T): T {
  return lodash.clone(obj);
}

// startswith(s, x) is true if s starts with the string x or any of the strings in x.
// It is false if s is not a string.
export function startswith(s: any, x: string | string[]): boolean {
  if (typeof s != "string") {
    return false;
  }
  if (typeof x === "string") {
    return s.indexOf(x) === 0;
  }
  for (const v of x) {
    if (s.indexOf(v) === 0) {
      return true;
    }
  }
  return false;
}

export function endswith(s: any, t: string): boolean {
  if (typeof s != "string") {
    return false;
  }
  return s.slice(s.length - t.length) === t;
}

// We use this uuid implementation only for the browser client.  For node code, use node-uuid.
export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const uuid_regexp = new RegExp(
  /[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/i
);
export function is_valid_uuid_string(uuid: string): boolean {
  return (
    typeof uuid === "string" && uuid.length === 36 && uuid_regexp.test(uuid)
  );
}

export function assert_uuid(uuid: string): void {
  if (!is_valid_uuid_string(uuid)) {
    throw Error(`invalid uuid='${uuid}'`);
  }
}

// Compute a uuid v4 from the Sha-1 hash of data.
// NOTE: If on backend, you should instead import
// the version in misc_node, which is faster.
export function uuidsha1(data: string): string {
  const s = sha1(data);
  let i = -1;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    i += 1;
    switch (c) {
      case "x":
        return s[i];
      case "y":
        // take 8 + low order 3 bits of hex number.
        return ((parseInt(`0x${s[i]}`, 16) & 0x3) | 0x8).toString(16);
    }
  });
}

// returns the number of keys of an object, e.g., {a:5, b:7, d:'hello'} --> 3
export function len(obj: object | undefined | null): number {
  if (obj == null) {
    return 0;
  }
  return Object.keys(obj).length;
}

// Specific, easy to read: describe amount of time before right now
// Use negative input for after now (i.e., in the future).
export function milliseconds_ago(ms: number): Date {
  return new Date(new Date().valueOf() - ms);
}
export function seconds_ago(s: number) {
  return milliseconds_ago(1000 * s);
}
export function minutes_ago(m: number) {
  return seconds_ago(60 * m);
}
export function hours_ago(h: number) {
  return minutes_ago(60 * h);
}
export function days_ago(d: number) {
  return hours_ago(24 * d);
}
export function weeks_ago(w: number) {
  return days_ago(7 * w);
}
export function months_ago(m: number) {
  return days_ago(30.5 * m);
}

// Here, we want to know how long ago a certain timestamp was
export function how_long_ago_ms(ts: Date | number): number {
  const ts_ms = typeof ts === "number" ? ts : ts.getTime();
  return new Date().getTime() - ts_ms;
}
export function how_long_ago_s(ts: Date | number): number {
  return how_long_ago_ms(ts) / 1000;
}
export function how_long_ago_m(ts: Date | number): number {
  return how_long_ago_s(ts) / 60;
}

// Current time in milliseconds since epoch or t.
export function mswalltime(t?: number): number {
  return new Date().getTime() - (t ?? 0);
}

// Current time in seconds since epoch, as a floating point
// number (so much more precise than just seconds), or time
// since t.
export function walltime(t) {
  return mswalltime() / 1000.0 - (t ?? 0);
}

// encode a UNIX path, which might have # and % in it.
// Maybe alternatively, (encodeURIComponent(p) for p in path.split('/')).join('/') ?
export function encode_path(path) {
  path = encodeURI(path); // doesn't escape # and ?, since they are special for urls (but not unix paths)
  return path.replace(/#/g, "%23").replace(/\?/g, "%3F");
}

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

export function is_valid_email_address(email: string): boolean {
  // From http://stackoverflow.com/questions/46155/validate-email-address-in-javascript
  // but converted to Javascript; it's near the middle but claims to be exactly RFC822.
  if (reValidEmail.test(email)) {
    return true;
  } else {
    return false;
  }
}

export const to_json = JSON.stringify;

// gives the plural form of the word if the number should be plural
export function plural(number, singular, plural = `${singular}s`) {
  if (["GB", "MB"].includes(singular)) {
    return singular;
  }
  if (number === 1) {
    return singular;
  } else {
    return plural;
  }
}

const ELLIPSES = "…";
// "foobar" --> "foo…"
export function trunc(s, max_length = 1024) {
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
}

// "foobar" --> "fo…ar"
export function trunc_middle(s, max_length = 1024) {
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
}

// "foobar" --> "…bar"
export function trunc_left(s, max_length = 1024): string | undefined {
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
}

/*
Like the immutable.js getIn, but on the thing x.
*/

export function getIn(x: any, path: string[], default_value?: any): any {
  for (const key of path) {
    if (x !== undefined) {
      try {
        x = x[key];
      } catch (err) {
        return default_value;
      }
    } else {
      return default_value;
    }
  }
  return x === undefined ? default_value : x;
}

// see http://stackoverflow.com/questions/1144783/replacing-all-occurrences-of-a-string-in-javascript
export function replace_all(
  s: string,
  search: string,
  replace: string
): string {
  return s.split(search).join(replace);
}

export function path_to_title(path: string): string {
  const subtitle = separate_file_extension(path_split(path).tail).name;
  return capitalize(replace_all(replace_all(subtitle, "-", " "), "_", " "));
}

// names is a Set<string>
export function list_alternatives(names): string {
  names = names.map((x) => x.toUpperCase()).toJS();
  if (names.length == 1) {
    return names[0];
  } else if (names.length == 2) {
    return `${names[0]} or ${names[1]}`;
  }
  return names.join(", ");
}

// convert x to a useful string to show to a user.
export function to_user_string(x: any): string {
  switch (typeof x) {
    case "undefined":
      return "undefined";
    case "number":
    case "symbol":
    case "boolean":
      return x.toString();
    case "function":
      return x.toString();
    case "object":
      if (typeof x.toString !== "function") {
        return JSON.stringify(x);
      }
      const a = x.toString(); // is much better than stringify for exceptions (etc.).
      if (a === "[object Object]") {
        return JSON.stringify(x);
      } else {
        return a;
      }
    default:
      return JSON.stringify(x);
  }
}

export function is_array(obj: any): boolean {
  return Object.prototype.toString.call(obj) === "[object Array]";
}

export let is_integer: Function = Number.isInteger;
if (is_integer == null) {
  is_integer = (n) => typeof n === "number" && n % 1 === 0;
}

export function is_string(obj: any): boolean {
  return typeof obj === "string";
}

// An object -- this is more constraining that typeof(obj) == 'object', e.g., it does
// NOT include Date.
export function is_object(obj: any): boolean {
  return Object.prototype.toString.call(obj) === "[object Object]";
}

export function is_date(obj: any): boolean {
  return obj instanceof Date;
}

// delete any null fields, to avoid wasting space.
export function delete_null_fields(obj: object): void {
  for (const k in obj) {
    if (obj[k] == null) {
      delete obj[k];
    }
  }
}

// for switch/case -- https://www.typescriptlang.org/docs/handbook/advanced-types.html
export function unreachable(x: never) {
  throw new Error(`All types should be exhausted, but I got ${x}`);
}

// Get *all* methods of an object (including from base classes!).
// See https://flaviocopes.com/how-to-list-object-methods-javascript/
// This is used by bind_methods below to bind all methods
// of an instance of an object, all the way up the
// prototype chain, just to be 100% sure!
function get_methods(obj: object): string[] {
  let properties = new Set<string>();
  let current_obj = obj;
  do {
    Object.getOwnPropertyNames(current_obj).map((item) => properties.add(item));
  } while ((current_obj = Object.getPrototypeOf(current_obj)));
  return [...properties.keys()].filter(
    (item) => typeof obj[item] === "function"
  );
}

// Bind all or specified methods of the object.  If method_names
// is not given, binds **all** methods.
// For example, in a base class constructor, you can do
//       bind_methods(this);
// and every method will always be bound even for derived classes
// (assuming they call super if they overload the constructor!).
// Do this for classes that don't get created in a tight inner
// loop and for which you want 'safer' semantics.
export function bind_methods<T extends object>(
  obj: T,
  method_names: undefined | string[] = undefined
): T {
  if (method_names === undefined) {
    method_names = get_methods(obj);
    method_names.splice(method_names.indexOf("constructor"), 1);
  }
  for (const method_name of method_names) {
    obj[method_name] = obj[method_name].bind(obj);
  }
  return obj;
}

export function human_readable_size(bytes: number | null | undefined): string {
  if (bytes == null) {
    return "?";
  }
  if (bytes < 1000) {
    return `${bytes} bytes`;
  }
  if (bytes < 1000000) {
    const b = Math.floor(bytes / 100);
    return `${b / 10} KB`;
  }
  if (bytes < 1000000000) {
    const b = Math.floor(bytes / 100000);
    return `${b / 10} MB`;
  }
  const b = Math.floor(bytes / 100000000);
  return `${b / 10} GB`;
}

// Regexp used to test for URLs in a string.
// We just use a simple one that was a top Google search when I searched: https://www.regextester.com/93652
// We don't use a complicated one like https://www.npmjs.com/package/url-regex, since
// (1) it is heavy and doesn't work on Edge -- https://github.com/sagemathinc/cocalc/issues/4056
// (2) it's not bad if we are extra conservative.  E.g., url-regex "matches the TLD against a list of valid TLDs."
//     which is really overkill for preventing abuse, and is clearly more aimed at highlighting URL's
//     properly (not our use case).
export const re_url = /(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?/gi;

export function contains_url(str: string): boolean {
  return !!str.toLowerCase().match(re_url);
}

// TODO: Move this var and the `delete_local_storage` to a new front-end-misc or something
// TS rightfully complains about this missing when built on back end systems
declare var localStorage;
/**
 * Deletes key from local storage
 * FRONT END ONLY
 */
export function delete_local_storage(key) {
  try {
    delete localStorage[key];
  } catch (e) {
    console.warn(`localStorage delete error -- ${e}`);
  }
}

// converts an array to a "human readable" array
export function to_human_list(arr) {
  arr = lodash.map(arr, (x) => x.toString());
  if (arr.length > 1) {
    return arr.slice(0, -1).join(", ") + " and " + arr.slice(-1);
  } else if (arr.length === 1) {
    return arr[0].toString();
  } else {
    return "";
  }
}

export function hidden_meta_file(path: string, ext: string): string {
  const p = path_split(path);
  let head: string = p.head;
  if (head !== "") {
    head += "/";
  }
  return head + "." + p.tail + "." + ext;
}

export function history_path(path: string): string {
  return hidden_meta_file(path, "time-travel");
}

export function meta_file(path: string, ext: string): string {
  return hidden_meta_file(path, "sage-" + ext);
}

// helps with converting an array of strings to a union type of strings.
// usage: 1. const foo : string[] = tuple(["bar", "baz"]);
//        2. type Foo = typeof foo[number]; // bar | baz;
export function tuple<T extends string[]>(o: T) {
  return o;
}

export function aux_file(path: string, ext: string): string {
  const s = path_split(path);
  s.tail += "." + ext;
  if (s.head) {
    return s.head + "/." + s.tail;
  } else {
    return "." + s.tail;
  }
}

/*
Generate a cryptographically safe secure random string with
16 characters chosen to be reasonably unambiguous to look at.
That is 93 bits of randomness, and there is an argument here
that 64 bits is enough:

https://security.stackexchange.com/questions/1952/how-long-should-a-random-nonce-be
*/
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function secure_random_token(
  length: number = 16,
  alphabet: string = BASE58 // default is this crypto base58 less ambiguous numbers/letters
): string {
  let s = "";
  if (length == 0) return s;
  if (alphabet.length == 0) {
    throw Error("impossible, since alphabet is empty");
  }
  const v = new Uint32Array(length);
  getRandomValues(v); // secure random numbers
  for (const i of v) {
    s += alphabet[i % alphabet.length];
  }
  return s;
}

// Return a random element of an array.
// If array has length 0 will return undefined.
export function random_choice(v: any[]): any {
  return v[Math.floor(Math.random() * v.length)];
}

// Called when an object will not be used further, to avoid
// it references anything that could lead to memory leaks.
export function close(obj: object, omit?: Set<string>): void {
  if (omit != null) {
    Object.keys(obj).forEach(function (key) {
      if (omit.has(key)) return;
      delete obj[key];
    });
  } else {
    Object.keys(obj).forEach(function (key) {
      delete obj[key];
    });
  }
}

// return true if the word contains the substring
export function contains(word: string, sub: string): boolean {
  return word.indexOf(sub) !== -1;
}

export function assertDefined<T>(val: T): asserts val is NonNullable<T> {
  if (val === undefined || val === null) {
    throw new Error(`Expected 'val' to be defined, but received ${val}`);
  }
}

// Round given number to 2 decimal places
export function round2(num): number {
  // padding to fix floating point issue (see http://stackoverflow.com/questions/11832914/round-to-at-most-2-decimal-places-in-javascript)
  return Math.round((num + 0.00001) * 100) / 100;
}

// returns the number parsed from the input text, or undefined if invalid
// rounds to the nearest 0.01 if round_number is true (default : true)
// allows negative numbers if allow_negative is true (default : false)
export function parse_number_input(
  input: any,
  round_number: boolean = true,
  allow_negative: boolean = false
): number | undefined {
  if (typeof input == "boolean") {
    return input ? 1 : 0;
  }

  if (typeof input == "number") {
    // easy to parse
    if (!isFinite(input)) {
      return;
    }
    if (!allow_negative && input < 0) {
      return;
    }
    return input;
  }

  if (input == null || !input) return 0;

  let val;
  const v = `${input}`.split("/"); // fraction?
  if (v.length !== 1 && v.length !== 2) {
    return undefined;
  }
  if (v.length === 2) {
    // a fraction
    val = parseFloat(v[0]) / parseFloat(v[1]);
  }
  if (v.length === 1) {
    val = parseFloat(v[0]);
    if (isNaN(val) || v[0].trim() === "") {
      // Shockingly, whitespace returns false for isNaN!
      return undefined;
    }
  }
  if (round_number) {
    val = round2(val);
  }
  if (isNaN(val) || val === Infinity || (val < 0 && !allow_negative)) {
    return undefined;
  }
  return val;
}

// MUTATE map by coercing each element of codomain to a number,
// with false->0 and true->1
// Non finite valuescoerce to 0.
// Also, returns map.
export function coerce_codomain_to_numbers(map: {
  [k: string]: any;
}): { [k: string]: number } {
  for (const k in map) {
    const x = map[k];
    if (typeof x === "boolean") {
      map[k] = x ? 1 : 0;
    } else {
      try {
        const t = parseFloat(x);
        if (!isFinite(t)) {
          map[k] = 0;
          continue;
        }
      } catch (_) {
        map[k] = 0;
        continue;
      }
    }
  }
  return map;
}

// arithmetic of maps with codomain numbers; missing values
// default to 0.  Despite the typing being that codomains are
// all numbers, we coerce null values to 0 as well.
export function map_sum(
  a?: { [k: string]: number },
  b?: { [k: string]: number }
): { [k: string]: number } {
  if (a == null) {
    return b ?? {};
  }
  if (b == null) {
    return a ?? {};
  }
  const c: { [k: string]: number } = {};
  for (const k in a) {
    c[k] = (a[k] ?? 0) + (b[k] ?? 0);
  }
  for (const k in b) {
    if (c[k] == null) {
      // anything in iteration above will be a number; also,
      // we know a[k] is null, since it was definintely not
      // iterated through above.
      c[k] = b[k] ?? 0;
    }
  }
  return c;
}

export function map_diff(
  a?: { [k: string]: number },
  b?: { [k: string]: number }
): { [k: string]: number } {
  if (b == null) {
    return a ?? {};
  }
  const c: { [k: string]: number } = {};
  if (a == null) {
    for (const k in b) {
      c[k] = -(b[k] ?? 0);
    }
    return c;
  }
  for (const k in a) {
    c[k] = (a[k] ?? 0) - (b[k] ?? 0);
  }
  for (const k in b) {
    if (c[k] == null) {
      // anything in iteration above will be a number; also,
      // we know a[k] is null, since it was definintely not
      // iterated through above.
      c[k] = -(b[k] ?? 0);
    }
  }
  return c;
}

// Like the split method, but quoted terms are grouped
// together for an exact search.
export function search_split(search: string): string[] {
  const terms: string[] = [];
  const v = search.toLowerCase().split('"');
  const { length } = v;
  for (let i = 0; i < v.length; i++) {
    let element = v[i];
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
}

// s = lower case string
// v = array of terms as output by search_split above
export function search_match(s: string, v: string[]): boolean {
  if (typeof s != "string" || !is_array(v)) {
    // be safe against non Typescript clients
    return false;
  }
  for (let x of v) {
    if (x[0] == "-") {
      // negate since first character is a -.  In this case,
      // it is NOT a match if it is there.
      const y = x.slice(1);
      if (y.length > 0 && s.indexOf(y) !== -1) {
        return false;
      }
    } else {
      // normal search - not a match if not there.
      if (s.indexOf(x) === -1) {
        return false;
      }
    }
  }
  // no term doesn't match, so we have a match.
  return true;
}

export const RUNNING_IN_NODE: boolean = process?.title == "node";

/*
The functions to_json_socket and from_json_socket are for sending JSON data back
and forth in serialized form over a socket connection.   They replace Date objects by the
object {DateEpochMS:ms_since_epoch} *only* during transit.   This is much better than
converting to ISO, then using a regexp, since then all kinds of strings will get
converted that were never meant to be date objects at all, e.g., a filename that is
a ISO time string.  Also, ms since epoch is less ambiguous regarding old/different
browsers, and more compact.

If you change SOCKET_DATE_KEY, then all clients and servers and projects must be
simultaneously restarted.  And yes, I perhaps wish I had made this key more obfuscated.
That said, we also check the object length when translating back so only objects
exactly of the form {DateEpochMS:value} get transformed to a date.
*/
const SOCKET_DATE_KEY = "DateEpochMS";

function socket_date_replacer(key: string, value: any): any {
  // @ts-ignore
  const x = this[key];
  return x instanceof Date ? { [SOCKET_DATE_KEY]: x.valueOf() } : value;
}

export function to_json_socket(x: any): string {
  return JSON.stringify(x, socket_date_replacer);
}

function socket_date_parser(_key: string, value: any): any {
  const x = value?.[SOCKET_DATE_KEY];
  return x != null && len(value) == 1 ? new Date(x) : value;
}

export function from_json_socket(x: string): any {
  try {
    return JSON.parse(x, socket_date_parser);
  } catch (err) {
    console.debug(`from_json: error parsing ${x} (=${to_json(x)}) from JSON`);
    throw err;
  }
}

// convert object x to a JSON string, removing any keys that have "pass" in them and
// any values that are potentially big -- this is meant to only be used for logging.
export function to_safe_str(x: any): string {
  if (typeof x === "string") {
    // nothing we can do at this point -- already a string.
    return x;
  }
  const obj = {};
  for (const key in x) {
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
        value = trunc(value, 250); // long strings are not SAFE -- since JSON'ing them for logging blocks for seconds!
      }
      obj[key] = value;
    }
  }

  return JSON.stringify(obj);
}

// convert from a JSON string to Javascript (properly dealing with ISO dates)
//   e.g.,   2016-12-12T02:12:03.239Z    and    2016-12-12T02:02:53.358752
const reISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
export function date_parser(_key: string, value) {
  if (typeof value === "string" && value.length >= 20 && reISO.exec(value)) {
    return ISO_to_Date(value);
  } else {
    return value;
  }
}

export function ISO_to_Date(s: string): Date {
  if (s.indexOf("Z") === -1) {
    // Firefox assumes local time rather than UTC if there is no Z.   However,
    // our backend might possibly send a timestamp with no Z and it should be
    // interpretted as UTC anyways.
    // That said, with the to_json_socket/from_json_socket code, the browser
    // shouldn't be running this parser anyways.
    // In particular: TODO -- completely get rid of using this in from_json... if possible!
    s += "Z";
  }
  return new Date(s);
}

export function from_json(x: string): any {
  try {
    return JSON.parse(x, date_parser);
  } catch (err) {
    console.debug(`from_json: error parsing ${x} (=${to_json(x)}) from JSON`);
    throw err;
  }
}

// Returns modified version of obj with any string
// that look like ISO dates to actual Date objects.  This mutates
// obj in place as part of the process.
// date_keys = 'all' or list of keys in nested object whose values
// should be considered.  Nothing else is considered!
export function fix_json_dates(obj: any, date_keys?: "all" | string[]) {
  if (date_keys == null) {
    // nothing to do
    return obj;
  }
  if (is_object(obj)) {
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
  } else if (is_array(obj)) {
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
}

// converts a Date object to an ISO string in UTC.
// NOTE -- we remove the +0000 (or whatever) timezone offset, since *all* machines within
// the CoCalc servers are assumed to be on UTC.
function to_iso(d: Date): string {
  return new Date(d.valueOf() - d.getTimezoneOffset() * 60 * 1000)
    .toISOString()
    .slice(0, -5);
}

// turns a Date object into a more human readable more friendly directory name in the local timezone
export function to_iso_path(d: Date): string {
  return to_iso(d).replace("T", "-").replace(/:/g, "");
}

// does the given object (first arg) have the given key (second arg)?
export const has_key: (obj: object, path: string[] | string) => boolean =
  lodash.has;

// returns the values of a map
export const values = lodash.values;

// as in python, makes a map from an array of pairs [(x,y),(z,w)] --> {x:y, z:w}
export function dict(v: [string, any][]): { [key: string]: any } {
  const obj: { [key: string]: any } = {};
  for (let a of Array.from(v)) {
    if (a.length !== 2) {
      throw new Error("ValueError: unexpected length of tuple");
    }
    obj[a[0]] = a[1];
  }
  return obj;
}

// remove first occurrence of value (just like in python);
// throws an exception if val not in list.
// mutates arr.
export function remove(arr: any[], val: any): void {
  for (
    let i = 0, end = arr.length, asc = 0 <= end;
    asc ? i < end : i > end;
    asc ? i++ : i--
  ) {
    if (arr[i] === val) {
      arr.splice(i, 1);
      return;
    }
  }
  throw new Error("ValueError -- item not in array");
}

export const max: (x: any[]) => any = lodash.max;
export const min: (x: any[]) => any = lodash.min;

// Takes a path string and file name and gives the full path to the file
export function path_to_file(path: string, file: string): string {
  if (path === "") {
    return file;
  }
  return path + "/" + file;
}

// Given a path of the form foo/bar/.baz.ext.something returns foo/bar/baz.ext.
// For example:
//    .example.ipynb.sage-jupyter --> example.ipynb
//    tmp/.example.ipynb.sage-jupyter --> tmp/example.ipynb
//    .foo.txt.sage-chat --> foo.txt
//    tmp/.foo.txt.sage-chat --> tmp/foo.txt

export function original_path(path: string): string {
  const s = path_split(path);
  if (s.tail[0] != "." || s.tail.indexOf(".sage-") == -1) {
    return path;
  }
  const ext = filename_extension(s.tail);
  let x = s.tail.slice(
    s.tail[0] === "." ? 1 : 0,
    s.tail.length - (ext.length + 1)
  );
  if (s.head !== "") {
    x = s.head + "/" + x;
  }
  return x;
}

export function lower_email_address(email_address: any): string {
  if (email_address == null) {
    return "";
  }
  if (typeof email_address !== "string") {
    // silly, but we assume it is a string, and I'm concerned
    // about an attack involving badly formed messages
    email_address = JSON.stringify(email_address);
  }
  // make email address lower case
  return email_address.toLowerCase();
}

// Parses a string representing a search of users by email or non-email
// Expects the string to be delimited by commas or semicolons
// between multiple users
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
//    string_queries: [["firstname", "lastname"], ["somestring"]]
//    email_queries: ["email@something.com", "justanemail@mail.com"]
// }
export function parse_user_search(query: string) {
  const r = { string_queries: [] as string[][], email_queries: [] as string[] };
  if (typeof query !== "string") {
    // robustness against bad input from non-TS client.
    return r;
  }
  const queries = query
    .split("\n")
    .map((q1) => q1.split(/,|;/))
    .reduce((acc, val) => acc.concat(val), []) // flatten
    .map((q) => q.trim().toLowerCase());
  const email_re = /<(.*)>/;
  for (const x of queries) {
    if (x) {
      if (x.indexOf("@") === -1) {
        // Is obviously not an email:
        r.string_queries.push(x.split(/\s+/g));
      } else {
        // Might be an email address:
        // extract just the email address out
        for (let a of split(x)) {
          // Ensures that we don't throw away emails like
          // "<validEmail>"withquotes@mail.com
          if (a[0] === "<") {
            const match = email_re.exec(a);
            a = match != null ? match[1] : a;
          }
          if (is_valid_email_address(a)) {
            r.email_queries.push(a);
          }
        }
      }
    }
  }
  return r;
}

// Delete trailing whitespace in the string s.
export function delete_trailing_whitespace(s: string): string {
  return s.replace(/[^\S\n]+$/gm, "");
}

export function retry_until_success(opts: {
  f: Function;
  start_delay?: number;
  max_delay?: number;
  factor?: number;
  max_tries?: number;
  max_time?: number;
  log?: Function;
  warn?: Function;
  name?: string;
  cb?: Function;
}): void {
  let start_time;
  opts = defaults(opts, {
    f: required, // f((err) => )
    start_delay: 100, // milliseconds
    max_delay: 20000, // milliseconds -- stop increasing time at this point
    factor: 1.4, // multiply delay by this each time
    max_tries: undefined, // maximum number of times to call f
    max_time: undefined, // milliseconds -- don't call f again if the call would start after this much time from first call
    log: undefined,
    warn: undefined,
    name: "",
    cb: undefined, // called with cb() on *success*; cb(error, last_error) if max_tries is exceeded
  });
  let delta = opts.start_delay as number;
  let tries = 0;
  if (opts.max_time != null) {
    start_time = new Date();
  }
  const g = function () {
    tries += 1;
    if (opts.log != null) {
      if (opts.max_tries != null) {
        opts.log(
          `retry_until_success(${opts.name}) -- try ${tries}/${opts.max_tries}`
        );
      }
      if (opts.max_time != null) {
        opts.log(
          `retry_until_success(${opts.name}) -- try ${tries} (started ${
            new Date().valueOf() - start_time
          }ms ago; will stop before ${opts.max_time}ms max time)`
        );
      }
      if (opts.max_tries == null && opts.max_time == null) {
        opts.log(`retry_until_success(${opts.name}) -- try ${tries}`);
      }
    }
    opts.f(function (err) {
      if (err) {
        if (err === "not_public") {
          opts.cb?.("not_public");
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
          opts.cb?.(
            `maximum tries (=${
              opts.max_tries
            }) exceeded - last error ${JSON.stringify(err)}`,
            err
          );
          return;
        }
        delta = Math.min(
          opts.max_delay as number,
          (opts.factor as number) * delta
        );
        if (
          opts.max_time != null &&
          new Date().valueOf() - start_time + delta > opts.max_time
        ) {
          opts.cb?.(
            `maximum time (=${
              opts.max_time
            }ms) exceeded - last error ${JSON.stringify(err)}`,
            err
          );
          return;
        }
        return setTimeout(g, delta);
      } else {
        if (opts.log != null) {
          opts.log(`retry_until_success(${opts.name}) -- success`);
        }
        opts.cb?.();
      }
    });
  };
  g();
}

