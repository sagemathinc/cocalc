/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

//##############################################################################
//
// CoCalc: Collaborative web-based calculation
// Copyright (C) 2017, Sagemath Inc.
// AGPLv3
//
//##############################################################################

/*
Handling of input opts to functions and type checking.
*/

let DEBUG, TEST_MODE, val;
const PropTypes = require("prop-types");

const immutable_types = require("./immutable-types");

/*
Testing related env/DEVEL/DEBUG stuff
*/

if (
  __guard__(
    typeof process !== "undefined" && process !== null
      ? process.env
      : undefined,
    (x) => x.DEVEL
  ) &&
  !__guard__(
    typeof process !== "undefined" && process !== null
      ? process.env
      : undefined,
    (x1) => x1.SMC_TEST
  )
) {
  // Running on node and DEVEL is set and not running under test suite
  DEBUG = true;
} else {
  DEBUG = false;
}

// console.debug only logs if DEBUG is true
if (DEBUG) {
  console.debug = console.log;
} else {
  console.debug = function () {};
}

if (
  __guard__(
    typeof process !== "undefined" && process !== null
      ? process.env
      : undefined,
    (x2) => x2.SMC_TEST
  )
) {
  // in test mode we *do* want exception to get thrown below when type checks fails
  TEST_MODE = true;
}

// Checks property types on a target object with checkers in a declaration.
// Declarations should throw an Error for mismatches and undefined if OK.
const types = (exports.types = function (target, declaration, identifier) {
  if (identifier == null) {
    identifier = "check.types";
  }
  if (typeof target !== "object") {
    throw new Error("Types was given a non-object to check");
  }

  if (typeof declaration !== "object") {
    throw new Error(
      `Types was given a ${typeof declaration} as a declaration instead of an object`
    );
  }

  return PropTypes.checkPropTypes(
    declaration,
    target,
    "checking a",
    identifier
  );
});

for (let key in PropTypes) {
  val = PropTypes[key];
  if (key !== "checkPropTypes" && key !== "PropTypes") {
    types[key] = val;
  }
}

types.immutable = immutable_types.immutable;

// Returns a new object with properties determined by those of obj1 and
// obj2.  The properties in obj1 *must* all also appear in obj2.  If an
// obj2 property has value "defaults.required", then it must appear in
// obj1.  For each property P of obj2 not specified in obj1, the
// corresponding value obj1[P] is set (all in a new copy of obj1) to
// be obj2[P].
exports.defaults = function (obj1, obj2, allow_extra, strict) {
  let err;
  if (strict == null) {
    strict = false;
  }
  if (obj1 == null) {
    obj1 = {};
  }
  const error = function () {
    try {
      return `(obj1=${exports.trunc(
        exports.to_json(obj1),
        1024
      )}, obj2=${exports.trunc(exports.to_json(obj2), 1024)})`;
    } catch (err) {
      return "";
    }
  };
  if (obj1 == null) {
    // useful special case
    obj1 = {};
  }
  if (typeof obj1 !== "object") {
    // We put explicit traces before the errors in this function,
    // since otherwise they can be very hard to debug.
    err = `BUG -- Traceback -- misc.defaults -- TypeError: function takes inputs as an object ${error()}`;
    if (strict || DEBUG || TEST_MODE) {
      throw new Error(err);
    } else {
      console.log(err);
      console.trace();
      return obj2;
    }
  }
  const r = {};
  for (var prop in obj2) {
    val = obj2[prop];
    if (obj1.hasOwnProperty(prop) && obj1[prop] != null) {
      if (obj2[prop] === exports.defaults.required && obj1[prop] == null) {
        err = `misc.defaults -- TypeError: property '${prop}' must be specified: ${error()}`;
        if (strict || DEBUG || TEST_MODE) {
          throw new Error(err);
        } else {
          console.warn(err);
          console.trace();
        }
      }
      r[prop] = obj1[prop];
    } else if (obj2[prop] != null) {
      // only record not undefined properties
      if (obj2[prop] === exports.defaults.required) {
        err = `misc.defaults -- TypeError: property '${prop}' must be specified: ${error()}`;
        if (strict || DEBUG || TEST_MODE) {
          throw new Error(err);
        } else {
          console.warn(err);
          console.trace();
        }
      } else {
        r[prop] = obj2[prop];
      }
    }
  }
  if (!allow_extra) {
    for (prop in obj1) {
      val = obj1[prop];
      if (!obj2.hasOwnProperty(prop)) {
        err = `misc.defaults -- TypeError: got an unexpected argument '${prop}' ${error()}`;
        console.trace();
        if (strict || DEBUG || TEST_MODE) {
          throw new Error(err);
        } else {
          console.warn(err);
        }
      }
    }
  }
  return r;
};

// WARNING -- don't accidentally use this as a default:
const required = (exports.required = exports.defaults.required =
  "__!!!!!!this is a required property!!!!!!__");

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
