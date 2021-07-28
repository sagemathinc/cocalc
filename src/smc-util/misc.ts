/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export { get_start_time_ts, get_uptime, log, wrap_log } from "./log";

import {
  is_array,
  is_integer,
  is_object,
  is_string,
  is_date,
  is_set,
} from "./type-checking";

export { is_array, is_integer, is_object, is_string, is_date, is_set };

export {
  map_limit,
  map_max,
  map_min,
  sum,
  is_zero_map,
  map_without_undefined,
  map_mutate_out_undefined,
} from "./maps";

export { done, done1, done2 } from "./done";

export {
  cmp,
  cmp_Date,
  cmp_moment,
  cmp_array,
  timestamp_cmp,
  field_cmp,
  is_different,
  is_different_array,
  shallowCompare,
  all_fields_equal,
} from "./cmp";

export {
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
} from "./relative-time";

export {
  set_local_storage,
  get_local_storage,
  has_local_storage,
  delete_local_storage,
  local_storage_length,
} from "./local-storage";

import * as sha1 from "sha1";
export { sha1 };

import * as lodash from "lodash";
import * as getRandomValues from "get-random-values";
import * as immutable from "immutable";

export const keys: (any) => string[] = lodash.keys;

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
  filename = path_split(filename).tail;
  const match = filename_extension_re.exec(filename);
  if (!match) {
    return "";
  }
  const ext = match[1];
  return ext ? ext : "";
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
export function separate_file_extension(name: string): {
  name: string;
  ext: string;
} {
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

export function endswith(s: any, t: any): boolean {
  if (typeof s != "string" || typeof t != "string") {
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
export function walltime(t?: number): number {
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

// Similar to replace_all, except it takes as input a function replace_f, which
// returns what to replace the i-th copy of search in string with.
export function replace_all_function(
  s: string,
  search: string,
  replace_f: (i: number) => string
): string {
  const v = s.split(search);
  const w: string[] = [];
  for (let i = 0; i < v.length; i++) {
    w.push(v[i]);
    if (i < v.length - 1) {
      w.push(replace_f(i));
    }
  }
  return w.join("");
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
export const re_url =
  /(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?/gi;

export function contains_url(str: string): boolean {
  return !!str.toLowerCase().match(re_url);
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
      if (typeof obj[key] == "function") return;
      delete obj[key];
    });
  } else {
    Object.keys(obj).forEach(function (key) {
      if (typeof obj[key] == "function") return;
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

export function round1(num: number): number {
  return Math.round(num * 10) / 10;
}

// Round given number to 2 decimal places
export function round2(num: number): number {
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
// Non finite values coerce to 0.
// Also, returns map.
export function coerce_codomain_to_numbers(map: { [k: string]: any }): {
  [k: string]: number;
} {
  for (const k in map) {
    const x = map[k];
    if (typeof x === "boolean") {
      map[k] = x ? 1 : 0;
    } else {
      try {
        const t = parseFloat(x);
        if (isFinite(t)) {
          map[k] = t;
        } else {
          map[k] = 0;
        }
      } catch (_) {
        map[k] = 0;
      }
    }
  }
  return map;
}

// arithmetic of maps with codomain numbers; missing values
// default to 0.  Despite the typing being that codomains are
// all numbers, we coerce null values to 0 as well, and all codomain
// values to be numbers, since definitely some client code doesn't
// pass in properly typed inputs.
export function map_sum(
  a?: { [k: string]: number },
  b?: { [k: string]: number }
): { [k: string]: number } {
  if (a == null) {
    return coerce_codomain_to_numbers(b ?? {});
  }
  if (b == null) {
    return coerce_codomain_to_numbers(a ?? {});
  }
  a = coerce_codomain_to_numbers(a);
  b = coerce_codomain_to_numbers(b);
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
    return coerce_codomain_to_numbers(a ?? {});
  }
  b = coerce_codomain_to_numbers(b);
  const c: { [k: string]: number } = {};
  if (a == null) {
    for (const k in b) {
      c[k] = -(b[k] ?? 0);
    }
    return c;
  }
  a = coerce_codomain_to_numbers(a);
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
  const v = search.split('"');
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

export let RUNNING_IN_NODE: boolean;
try {
  RUNNING_IN_NODE = process?.title == "node";
} catch (_err) {
  // error since process probably not defined at all (unless there is a node polyfill).
  RUNNING_IN_NODE = false;
}

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

    if (
      key.indexOf("pass") !== -1 ||
      key.indexOf("token") !== -1 ||
      key.indexOf("secret") !== -1
    ) {
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
        value = trunc(value, 1000); // long strings are not SAFE -- since JSON'ing them for logging blocks for seconds!
      }
      obj[key] = value;
    }
  }

  return JSON.stringify(obj);
}

// convert from a JSON string to Javascript (properly dealing with ISO dates)
//   e.g.,   2016-12-12T02:12:03.239Z    and    2016-12-12T02:02:53.358752
const reISO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
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

// Class to use for mapping a collection of strings to characters (e.g., for use with diff/patch/match).
export class StringCharMapping {
  private _to_char: { [s: string]: string } = {};
  private _next_char: string = "A";
  public _to_string: { [s: string]: string } = {}; // yes, this is publicly accessed (TODO: fix)

  constructor(opts?) {
    let ch, st;
    this.find_next_char = this.find_next_char.bind(this);
    this.to_string = this.to_string.bind(this);
    this.to_array = this.to_array.bind(this);
    if (opts == null) {
      opts = {};
    }
    opts = defaults(opts, {
      to_char: undefined,
      to_string: undefined,
    });
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
    this.find_next_char();
  }

  private find_next_char(): void {
    while (true) {
      this._next_char = String.fromCharCode(this._next_char.charCodeAt(0) + 1);
      if (this._to_string[this._next_char] == null) {
        // found it!
        break;
      }
    }
  }

  public to_string(strings: string[]): string {
    let t = "";
    for (const s of strings) {
      const a = this._to_char[s];
      if (a != null) {
        t += a;
      } else {
        t += this._next_char;
        this._to_char[s] = this._next_char;
        this._to_string[this._next_char] = s;
        this.find_next_char();
      }
    }
    return t;
  }

  public to_array(x: string): string[] {
    return Array.from(x).map((s) => this.to_string[s]);
  }
}

// Used in the database, etc., for different types of users of a project
export const PROJECT_GROUPS: string[] = [
  "owner",
  "collaborator",
  "viewer",
  "invited_collaborator",
  "invited_viewer",
];

// format is 2014-04-04-061502
export function parse_bup_timestamp(s: string): Date {
  const v = [
    s.slice(0, 4),
    s.slice(5, 7),
    s.slice(8, 10),
    s.slice(11, 13),
    s.slice(13, 15),
    s.slice(15, 17),
    "0",
  ];
  return new Date(`${v[1]}/${v[2]}/${v[0]} ${v[3]}:${v[4]}:${v[5]} UTC`);
}

export function hash_string(s: string): number {
  if (typeof s != "string") {
    return 0; // just in case non-typescript code tries to use this
  }
  // see http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
  let hash = 0;
  if (s.length === 0) {
    return hash;
  }
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const chr = s.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // convert to 32-bit integer
  }
  return hash;
}

export function parse_hashtags(t: string): [number, number][] {
  // return list of pairs (i,j) such that t.slice(i,j) is a hashtag (starting with #).
  const v: [number, number][] = [];
  if (typeof t != "string") {
    // in case of non-Typescript user
    return v;
  }
  let base = 0;
  while (true) {
    let i: number = t.indexOf("#");
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
    const m = t.match(/\s|[^A-Za-z0-9_\-]/);
    if (m && m.index != null) {
      i = m.index;
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
}

// Return true if (1) path is contained in one
// of the given paths (a list of strings) -- or path without
// zip extension is in paths.
// Always returns false if path is undefined/null (since
// that might be dangerous, right)?
export function path_is_in_public_paths(
  path: string,
  paths: string[] | Set<string> | object | undefined
): boolean {
  return containing_public_path(path, paths) != null;
}

// returns a string in paths if path is public because of that string
// Otherwise, returns undefined.
// IMPORTANT: a possible returned string is "", which is falsey but defined!
// paths can be an array or object (with keys the paths) or a Set
export function containing_public_path(
  path: string,
  paths: string[] | Set<string> | object | undefined
): undefined | string {
  if (paths == null || path == null) {
    // just in case of non-typescript clients
    return;
  }
  if (path.indexOf("../") !== -1) {
    // just deny any potentially trickiery involving relative
    // path segments (TODO: maybe too restrictive?)
    return;
  }
  if (is_array(paths) || is_set(paths)) {
    // array so "of"
    // @ts-ignore
    for (const p of paths) {
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
    for (const p in paths) {
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
  if (filename_extension(path) === "zip") {
    // is path something_public.zip ?
    return containing_public_path(path.slice(0, path.length - 4), paths);
  }
  return undefined;
}

export const is_equal = lodash.isEqual;

export function is_whitespace(s?: string): boolean {
  return (s?.trim().length ?? 0) == 0;
}

export function lstrip(s: string): string {
  return s.replace(/^\s*/g, "");
}

export function date_to_snapshot_format(
  d: Date | undefined | null | number
): string {
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
}

export function stripe_date(d: number): string {
  // https://github.com/sagemathinc/cocalc/issues/3254
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl#Locale_negotiation
  return new Date(d * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function to_money(n: number): string {
  // see http://stackoverflow.com/questions/149055/how-can-i-format-numbers-as-money-in-javascript
  // TODO: replace by using react-intl...
  return n.toFixed(2).replace(/(\d)(?=(\d{3})+\.)/g, "$1,");
}

export function stripe_amount(units: number, currency: string): string {
  // input is in pennies
  if (currency !== "usd") {
    throw Error(`not-implemented currency ${currency}`);
  }
  let s = `$${to_money(units / 100)}`;
  if (s.slice(s.length - 3) === ".00") {
    s = s.slice(0, s.length - 3);
  }
  return s;
}

// get a subarray of all values between the two given values inclusive,
// provided in either order
export function get_array_range(arr: any[], value1: any, value2: any): any[] {
  let index1 = arr.indexOf(value1);
  let index2 = arr.indexOf(value2);
  if (index1 > index2) {
    [index1, index2] = [index2, index1];
  }
  return arr.slice(index1, +index2 + 1 || undefined);
}

function seconds2hms_days(
  d: number,
  h: number,
  m: number,
  longform: boolean
): string {
  h = h % 24;
  const s = h * 60 * 60 + m * 60;
  const x = s > 0 ? seconds2hms(s, longform, false) : "";
  if (longform) {
    return `${d} ${plural(d, "day")} ${x}`.trim();
  } else {
    return `${d}d${x}`;
  }
}

// like seconds2hms, but only up to minute-resultion
export function seconds2hm(secs: number, longform: boolean = false): string {
  return seconds2hms(secs, longform, false);
}

// dear future developer: look into test/misc-test.coffee to see how the expected output is defined.
export function seconds2hms(
  secs: number,
  longform: boolean = false,
  show_seconds: boolean = true
): string {
  let s;
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
      return `${s} ${plural(s, "second")}`;
    } else {
      return `${s}s`;
    }
  }
  if (h > 0) {
    if (longform) {
      let ret = `${h} ${plural(h, "hour")}`;
      if (m > 0) {
        ret += ` ${m} ${plural(m, "minute")}`;
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
        let ret = `${m} ${plural(m, "minute")}`;
        if (s > 0) {
          ret += ` ${s} ${plural(s, "second")}`;
        }
        return ret;
      } else {
        return `${m}m${s}s`;
      }
    } else {
      if (longform) {
        return `${m} ${plural(m, "minute")}`;
      } else {
        return `${m}m`;
      }
    }
  }
  return "";
}

export function range(n: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < n; i++) {
    v.push(i);
  }
  return v;
}

// foreground; otherwise, return false.
export function should_open_in_foreground(e): boolean {
  // for react.js synthetic mouse events, where e.which is undefined!
  if (e.constructor.name === "SyntheticMouseEvent") {
    e = e.nativeEvent;
  }
  //console.log("e: #{e}, e.which: #{e.which}", e)
  return !(e.which === 2 || e.metaKey || e.altKey || e.ctrlKey);
}

// Like Python's enumerate
export function enumerate(v: any[]) {
  const w: [number, any][] = [];
  let i = 0;
  for (let x of Array.from(v)) {
    w.push([i, x]);
    i += 1;
  }
  return w;
}

// converts an array to a "human readable" array
export function to_human_list(arr: any[]): string {
  arr = lodash.map(arr, (x) => `${x}`);
  if (arr.length > 1) {
    return arr.slice(0, -1).join(", ") + " and " + arr.slice(-1);
  } else if (arr.length === 1) {
    return arr[0].toString();
  } else {
    return "";
  }
}

// derive the console initialization filename from the console's filename
// used in webapp and console_server_child
export function console_init_filename(path: string): string {
  const x = path_split(path);
  x.tail = `.${x.tail}.init`;
  if (x.head === "") {
    return x.tail;
  }
  return [x.head, x.tail].join("/");
}

export function has_null_leaf(obj: object): boolean {
  for (const k in obj) {
    const v = obj[k];
    if (v === null || (typeof v === "object" && has_null_leaf(v))) {
      return true;
    }
  }
  return false;
}

// Peer Grading
// This function takes a list of student_ids,
// and a number N of the desired number of peers per student.
// It returns an object, mapping each student to a list of N peers.
export function peer_grading(
  students: string[],
  N: number = 2
): { [student_id: string]: string[] } {
  if (N <= 0) {
    throw Error("Number of peer assigments must be at least 1");
  }
  if (students.length <= N) {
    throw Error(`You need at least ${N + 1} students`);
  }

  const assignment: { [student_id: string]: string[] } = {};

  // make output dict keys sorted like students input array
  for (const s of students) {
    assignment[s] = [];
  }

  // randomize peer assignments
  const s_random = lodash.shuffle(students);

  // the peer grading groups are set here. Think of nodes in
  // a circular graph, and node i is associated with grading
  // nodes i+1 up to i+N.
  const L = students.length;
  for (let i = 0; i < L; i++) {
    for (let j = i + 1; j <= i + N; j++) {
      assignment[s_random[i]].push(s_random[j % L]);
    }
  }

  // sort each peer group by the order of the `student` input list
  for (let k in assignment) {
    const v = assignment[k];
    assignment[k] = lodash.sortBy(v, (s) => students.indexOf(s));
  }
  return assignment;
}

// Converts ticket number to support ticket url (currently zendesk)
export function ticket_id_to_ticket_url(tid: string): string {
  return `https://sagemathcloud.zendesk.com/requests/${tid}`;
}

// Checks if the string only makes sense (heuristically) as downloadable url
export function is_only_downloadable(s: string): boolean {
  return s.indexOf("://") !== -1 || startswith(s, "git@github.com");
}

export function ensure_bound(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

// convert a file path to the "name" of the underlying editor tab.
// needed because otherwise filenames like 'log' would cause problems
export function path_to_tab(name: string): string {
  return `editor-${name}`;
}

// assumes a valid editor tab name...
// If invalid or undefined, returns undefined
export function tab_to_path(name: string): string | undefined {
  if (name?.substring(0, 7) === "editor-") {
    return name.substring(7);
  }
  return;
}

// suggest a new filename when duplicating it as follows:
// strip extension, split at '_' or '-' if it exists
// try to parse a number, if it works, increment it, etc.
export function suggest_duplicate_filename(name: string): string {
  let ext;
  ({ name, ext } = separate_file_extension(name));
  const idx_dash = name.lastIndexOf("-");
  const idx_under = name.lastIndexOf("_");
  const idx = Math.max(idx_dash, idx_under);
  let new_name: string | undefined = undefined;
  if (idx > 0) {
    const [prefix, ending] = Array.from([
      name.slice(0, idx + 1),
      name.slice(idx + 1),
    ]);
    const num = parseInt(ending);
    if (!Number.isNaN(num)) {
      new_name = `${prefix}${num + 1}`;
    }
  }
  if (new_name == null) {
    new_name = `${name}-1`;
  }
  if (ext.length > 0) {
    new_name += "." + ext;
  }
  return new_name;
}

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
export function top_sort(
  DAG: { [node: string]: string[] },
  opts: { omit_sources?: boolean } = { omit_sources: false }
): string[] {
  const { omit_sources } = opts;
  const source_names: string[] = [];
  let num_edges = 0;
  const graph_nodes = {};

  // Ready the nodes for top sort
  for (const name in DAG) {
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
    for (const parent_name of parents) {
      // include element in "parent_set" (see https://github.com/sagemathinc/cocalc/issues/1710)
      node.parent_set[parent_name] = true;
      if (graph_nodes[parent_name] == null) {
        graph_nodes[parent_name] = {};
        // Cover implicit nodes which are assumed to be source nodes
        if (DAG[parent_name] == null) {
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
  const path: string[] = [];
  const num_sources = source_names.length;
  let walked_edges = 0;

  while (source_names.length !== 0) {
    const curr_name = source_names.shift();
    if (curr_name == null) throw Error("BUG -- can't happen"); // TS :-)
    path.push(curr_name);

    for (const child of graph_nodes[curr_name].children) {
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
    /*// uncomment this when debugging problems.
    if (typeof window != "undefined") {
      (window as any)._DAG = DAG;
    } // so it's possible to debug in browser
    */
    throw new Error("Store has a cycle in its computed values");
  }

  if (omit_sources) {
    return path.slice(num_sources);
  } else {
    return path;
  }
}

// Takes an object obj with keys and values where
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
export function create_dependency_graph(obj: {
  [name: string]: Function & { dependency_names?: string };
}): { [name: string]: string[] } {
  const DAG = {};
  for (const name in obj) {
    const written_func = obj[name];
    DAG[name] = written_func.dependency_names ?? [];
  }
  return DAG;
}

// ORDER MATTERS! -- this gets looped over and searches happen -- so the 1-character ops must be last.
export type OPERATORS = "!=" | "<>" | "<=" | ">=" | "==" | "<" | ">" | "=";
export const operators: OPERATORS[] = [
  "!=",
  "<>",
  "<=",
  ">=",
  "==",
  "<",
  ">",
  "=",
];

export function op_to_function(op: string): (a, b) => boolean {
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
      throw Error(`operator must be one of '${JSON.stringify(operators)}'`);
  }
}

// modify obj in place substituting as specified in subs recursively,
// both for keys *and* values of obj.  E.g.,
//  obj ={a:{b:'d',d:5}};   obj_key_subs(obj, {d:'x'})
// then obj --> {a:{b:'x',x:5}}.
// This is actually used in user queries to replace {account_id}, {project_id},
// and {now}, but special strings or the time in queries.
export function obj_key_subs(obj: object, subs: { [key: string]: any }): void {
  for (const k in obj) {
    const v = obj[k];
    const s: any = subs[k];
    if (typeof s == "string") {
      // key substitution for strings
      delete obj[k];
      obj[s] = v;
    }
    if (typeof v === "object") {
      obj_key_subs(v, subs);
    } else if (typeof v === "string") {
      // value substitution
      const s2: any = subs[v];
      if (s2 != null) {
        obj[k] = s2;
      }
    }
  }
}

// this is a helper for sanitizing html. It is used in
// * smc-util-node/misc_node → sanitize_html
// * smc-webapp/misc-page    → sanitize_html
export function sanitize_html_attributes($, node): void {
  $.each(node.attributes, function () {
    // sometimes, "this" is undefined -- #2823
    // @ts-ignore -- no implicit this
    if (this == null) {
      return;
    }
    // @ts-ignore -- no implicit this
    const attrName = this.name;
    // @ts-ignore -- no implicit this
    const attrValue = this.value;
    // remove attribute name start with "on", possible
    // unsafe, e.g.: onload, onerror...
    // remove attribute value start with "javascript:" pseudo
    // protocol, possible unsafe, e.g. href="javascript:alert(1)"
    if (
      attrName?.indexOf("on") === 0 ||
      attrValue?.indexOf("javascript:") === 0
    ) {
      $(node).removeAttr(attrName);
    }
  });
}

// cocalc analytics cookie name
export const analytics_cookie_name = "CC_ANA";

// convert a jupyter kernel language (i.e. "python" or "r", usually short and lowercase)
// to a canonical name.
export function jupyter_language_to_name(lang: string): string {
  if (lang === "python") {
    return "Python";
  } else if (lang === "gap") {
    return "GAP";
  } else if (lang === "sage" || exports.startswith(lang, "sage-")) {
    return "SageMath";
  } else {
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  }
}

// Find the kernel whose name is closest to the given name.
export function closest_kernel_match(
  name: string,
  kernel_list: immutable.List<immutable.Map<string, string>>
): immutable.Map<string, string> {
  name = name.toLowerCase().replace("matlab", "octave");
  name = name === "python" ? "python3" : name;
  let bestValue = -1;
  let bestMatch: immutable.Map<string, string> | undefined = undefined;
  for (let i = 0; i < kernel_list.size; i++) {
    const k = kernel_list.get(i);
    if (k == null) {
      // This happened to Harald once when using the "mod sim py" custom image.
      continue;
    }
    // filter out kernels with negative priority (using the priority
    // would be great, though)
    if (k.getIn(["metadata", "cocalc", "priority"], 0) < 0) continue;
    const kernel_name = k.get("name")?.toLowerCase();
    if (!kernel_name) continue;
    let v = 0;
    for (let j = 0; j < name.length; j++) {
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
        compareVersionStrings(
          k.get("name") ?? "",
          bestMatch.get("name") ?? ""
        ) === 1)
    ) {
      bestValue = v;
      bestMatch = k;
    }
  }
  if (bestMatch == null) {
    // should be impossible in practice since kernel_list is non-empty and so
    // on, but just in case...
    return kernel_list.get(0) ?? immutable.Map<string, string>();
  }
  return bestMatch;
}

// compareVersionStrings takes two strings "a","b"
// and returns 1 is "a" is bigger, 0 if they are the same, and -1 if "a" is smaller.
// By "bigger" we compare the integer and non-integer parts of the strings separately.
// Examples:
//     - "sage.10" is bigger than "sage.9" (because 10 > 9)
//     - "python.1" is bigger than "sage.9" (because "python" > "sage")
//     - "sage.1.23" is bigger than "sage.0.456" (because 1 > 0)
//     - "sage.1.2.3" is bigger than "sage.1.2" (because "." > "")
function compareVersionStrings(a: string, b: string): -1 | 0 | 1 {
  const av: string[] = a.split(/(\d+)/);
  const bv: string[] = b.split(/(\d+)/);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const l = av[i] ?? "";
    const r = bv[i] ?? "";
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
}

// Count number of occurrences of m in s-- see http://stackoverflow.com/questions/881085/count-the-number-of-occurences-of-a-character-in-a-string-in-javascript

export function count(str: string, strsearch: string): number {
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
}

// right pad a number using html's &nbsp;
// by default, rounds number to a whole integer
export function rpad_html(num: number, width: number, round_fn?: Function) {
  num = (round_fn ?? Math.round)(num);
  const s = "&nbsp;";
  if (num == 0) return lodash.repeat(s, width - 1) + "0";
  if (num < 0) return num; // TODO not implemented
  const str = `${num}`;
  const pad = Math.max(0, width - str.length);
  return lodash.repeat(s, pad) + str;
}
