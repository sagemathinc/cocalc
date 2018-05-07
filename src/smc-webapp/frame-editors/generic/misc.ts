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

export function cmp(a:any, b:any) : -1|0|1 {
    if (a < b) {
        return -1;
    } else if (a > b) {
        return 1;
    }
    return 0;
}
