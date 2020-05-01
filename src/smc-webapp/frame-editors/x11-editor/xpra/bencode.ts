/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * license
 */

//  Copyright (c) 2009 Anton Ekblad
//  Copyright (c) 2013 Antoine Martin <antoine@devloop.org.uk>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software. */

// This is a modified version, suitable for xpra wire encoding:
// - the input can be a string or byte array
// - we do not sort lists or dictionaries (the existing order is preserved)
// - error out instead of writing "null" and generating a broken stream
// - handle booleans as ints (0, 1)

// bencode an object
export function bencode(obj: any): string {
  if (obj === null || obj === undefined) {
    throw Error("invalid: cannot bencode null");
  }
  switch (btypeof(obj)) {
    case "string":
      return bstring(obj);
    case "number":
      return bint(obj);
    case "list":
      return blist(obj);
    case "dictionary":
      return bdict(obj);
    case "boolean":
      return bint(obj ? 1 : 0);
    default:
      throw Error(`invalid object type in source: ${btypeof(obj)}`);
  }
}

function uintToString(uintArray: Uint8Array): string {
  // apply in chunks of 10400 to avoid call stack overflow
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply
  let s = "";
  const skip = 10400;
  const slice = uintArray.slice;
  for (let i = 0, len = uintArray.length; i < len; i += skip) {
    if (!slice) {
      s += String.fromCharCode.apply(
        null,
        uintArray.subarray(i, Math.min(i + skip, len))
      );
    } else {
      s += String.fromCharCode.apply(
        null,
        uintArray.slice(i, Math.min(i + skip, len))
      );
    }
  }
  return s;
}

// decode a bencoded string or bytearray into a javascript object
export function bdecode(buf: string | Uint8Array): any[] | null {
  if (typeof buf !== "string") {
    // if we have a byte array as input, its more efficient to convert the whole
    // thing into a string at once
    buf = uintToString(buf);
  }
  const dec = bparse(buf);
  if (dec == null) {
    return null;
  } else {
    return dec[0];
  }
}

// parse a bencoded string; bdecode is really just a wrapper for this one.
// all bparse* functions return an array in the form
// [parsed object, remaining buffer to parse]
function bparse(str: string): [any, string] | null {
  switch (str.charAt(0)) {
    case "d":
      return bparseDict(str.substr(1));
    case "l":
      return bparseList(str.substr(1));
    case "i":
      return bparseInt(str.substr(1));
    default:
      return bparseString(str);
  }
}

// parse a bencoded string
function bparseString(str: string): [any, string] | null {
  const str2 = str.split(":", 1)[0];
  if (isNum(str2)) {
    const len = parseInt(str2, 10);
    return [
      str.substr(str2.length + 1, len),
      str.substr(str2.length + 1 + len),
    ];
  }
  return null;
}

// parse a bencoded integer
function bparseInt(str: string): [any, string] | null {
  const str2 = str.split("e", 1)[0];
  if (!isNum(str2)) {
    return null;
  }
  return [parseInt(str2, 10), str.substr(str2.length + 1)];
}

// parse a bencoded list
function bparseList(str: string): [any, string] | null {
  let p,
    list: any[] = [];
  while (str.charAt(0) !== "e" && str.length > 0) {
    p = bparse(str);
    if (null === p) {
      return null;
    }
    list[list.length] = p[0];
    str = p[1];
  }
  if (str.length <= 0) {
    throw Error("unexpected end of buffer reading list");
  }
  return [list, str.substr(1)];
}

// parse a bencoded dictionary
function bparseDict(str: string): [any, string] | null {
  let key,
    val,
    dict = {};
  while (str.charAt(0) !== "e" && str.length > 0) {
    key = bparseString(str);
    if (null === key) {
      return null;
    }
    val = bparse(key[1]);
    if (null === val) {
      return null;
    }
    dict[key[0]] = val[0];
    str = val[1];
  }
  if (str.length <= 0) {
    return null;
  }
  return [dict, str.substr(1)];
}

// is the given string numeric?
function isNum(str: string): boolean {
  return !isNaN(Number(str));
}

// returns the bencoding type of the given object
function btypeof(obj): string {
  const type = typeof obj;
  if (type === "object") {
    if (typeof obj.length === "undefined") {
      return "dictionary";
    }
    return "list";
  }
  return type;
}

// bencode a string
function bstring(str: string): string {
  return str.length + ":" + str;
}

// bencode an integer
function bint(num: number): string {
  return "i" + num + "e";
}

// bencode a list
function blist(list: any[]): string {
  let str;
  str = "l";
  for (const key in list) {
    str += bencode(list[key]);
  }
  return str + "e";
}

// bencode a dictionary
function bdict(dict: any): string {
  let str;
  str = "d";
  for (const key in dict) {
    str += bencode(key) + bencode(dict[key]);
  }
  return str + "e";
}
