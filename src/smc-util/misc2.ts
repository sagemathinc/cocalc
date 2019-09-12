/*
This is a rewrite and SUCCESSOR to ./misc.js.

Each function is rethought from scratch, and we try to implement
it in a more modern ES 2018/Typescript/standard libraries approach.

**The exact behavior of functions may change from what is in misc.js!**
*/

import * as lodash from "lodash";
export const keys = lodash.keys;

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

const filename_extension_re = /(?:\.([^.]+))?$/;
export function filename_extension(filename: string): string {
  const match = filename_extension_re.exec(filename);
  if (!match) {
    return "";
  }
  const ext = match[1];
  return (ext ? ext : "").toLowerCase();
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

// Like Python splitlines.
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

export function is_different(a: any, b: any, fields: string[]): boolean {
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

// Modifies in place the object dest so that it
// includes all values in objs and returns dest
// Rightmost object overwrites left.
export function merge(dest, ...objs) {
  for (let obj of objs) {
    for (let k in obj) {
      dest[k] = obj[k];
    }
  }
  return dest;
}

// copy of map but only with some keys
// I.e., restrict a function to a subset of the domain.
export function copy_with(obj: object, w: string | string[]): object {
  if (typeof w === "string") {
    w = [w];
  }
  let obj2: any = {};
  let key: string;
  for (key of w) {
    const y = obj[key];
    if (y !== undefined) {
      obj2[key] = y;
    }
  }
  return obj2;
}

import { cloneDeep } from "lodash";
export const deep_copy = cloneDeep;

// Very poor man's set.
export function set(v: string[]): { [key: string]: true } {
  const s: { [key: string]: true } = {};
  for (let x of v) {
    s[x] = true;
  }
  return s;
}

export function cmp(a: any, b: any): -1 | 0 | 1 {
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
*/

export function cmp_Date(
  a: Date | undefined | null,
  b: Date | undefined | null
): -1 | 0 | 1 {
  if (a == null) {
    if (b == null) {
      return 0;
    }
    return -1;
  }
  if (b == null) {
    return 1;
  }
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  }
  return 0; // note: a == b for Date objects doesn't work as expected, but that's OK here.
}

// see https://stackoverflow.com/questions/728360/how-do-i-correctly-clone-a-javascript-object/30042948#30042948
export function copy<T>(obj: T): T {
  return Object.assign({}, obj);
}

// startswith(s, x) is true if s starts with the string x or any of the strings in x.
// It is false if s is not a string.
export function startswith(s: string, x: string | string[]): boolean {
  if (typeof x === "string") {
    return s.indexOf(x) === 0;
  }
  for (let v of x) {
    if (s.indexOf(v) === 0) {
      return true;
    }
  }
  return false;
}

export function endswith(s: string, t: string): boolean {
  return s.slice(s.length - t.length) === t;
}

// We use this uuid implementation only for the browser client.  For node code, use node-uuid.
export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
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

export function history_path(path: string): string {
  const p = path_split(path);
  if (p.head) {
    return `${p.head}/.${p.tail}.sage-history`;
  } else {
    return `.${p.tail}.sage-history`;
  }
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
export function milliseconds_ago(ms) {
  return new Date(new Date().valueOf() - ms);
}
export function seconds_ago(s) {
  return exports.milliseconds_ago(1000 * s);
}
export function minutes_ago(m) {
  return exports.seconds_ago(60 * m);
}
export function hours_ago(h) {
  return exports.minutes_ago(60 * h);
}
export function days_ago(d) {
  return exports.hours_ago(24 * d);
}
export function weeks_ago(w) {
  return exports.days_ago(7 * w);
}
export function months_ago(m) {
  return exports.days_ago(30.5 * m);
}

// encode a UNIX path, which might have # and % in it.
// Maybe alternatively, (encodeURIComponent(p) for p in path.split('/')).join('/') ?
export function encode_path(path) {
  path = encodeURI(path); // doesn't escape # and ?, since they are special for urls (but not unix paths)
  return path.replace(/#/g, "%23").replace(/\?/g, "%3F");
}

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
  for (let key of path) {
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
  let subtitle = separate_file_extension(path_split(path).tail).name;
  return capitalize(replace_all(replace_all(subtitle, "-", " "), "_", " "));
}

// names is a Set<string>
export function list_alternatives(names): string {
  names = names.map(x => x.toUpperCase()).toJS();
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
  is_integer = n => typeof n === "number" && n % 1 === 0;
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
  for (let k in obj) {
    if (obj[k] == null) {
      delete obj[k];
    }
  }
}

// for switch/case -- https://www.typescriptlang.org/docs/handbook/advanced-types.html
export function unreachable(x: never) {
  throw new Error(`All types should be exhausted, but I got ${x}`);
}

export function bind_methods(obj: any, method_names: string[]): void {
  for (let method_name of method_names) {
    obj[method_name] = obj[method_name].bind(obj);
  }
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

// typescript tuple, use this to convert an array to a literal type. e.g.
// const types = tuple("error", "default", "success", "info");
// type Severity = typeof types[number];
export function tuple<T extends string[]>(...o: T) {
  return o;
}
