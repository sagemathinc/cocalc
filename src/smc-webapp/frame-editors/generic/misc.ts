/*
THIS SHOULD BE MOVED OUT OF frame-editors/


This is a rewrite of what we're using from smc-util/misc...
*/

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
  return ext ? ext : "";
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

// Like Python splitlines.
export function splitlines(s: string): string[] {
  const r = s.match(/[^\r\n]+/g);
  return r ? r : [];
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
  const set = {};
  if (typeof w === "string") {
    set[w] = true;
  } else {
    for (let x in w) {
      set[x] = true;
    }
  }

  const r = {};
  for (let x in obj) {
    const y = obj[x];
    if (set[y]) {
      r[x] = y;
    }
  }
  return r;
}

export function set(v: string[]): object {
  const s = {};
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

export function cmp_Date(a : Date | undefined | null, b : Date | undefined | null) : -1 | 0 | 1 {
    if ((a == null)) {
        return -1;
    }
    if ((b == null)) {
        return 1;
    }
    if (a < b) {
        return -1;
    } else if (a > b) {
        return 1;
    }
    return 0;   // note: a == b for Date objects doesn't work as expected, but that's OK here.
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
export function milliseconds_ago(ms) { return new Date(new Date().valueOf() - ms); }
export function seconds_ago(s)  { return exports.milliseconds_ago(1000*s); }
export function minutes_ago(m)  { return exports.seconds_ago(60*m); }
export function hours_ago(h)  { return exports.minutes_ago(60*h); }
export function days_ago(d)  { return exports.hours_ago(24*d); }
export function weeks_ago(w)  { return exports.days_ago(7*w); }
export function months_ago(m)  { return exports.days_ago(30.5*m); }
