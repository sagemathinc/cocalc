/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//##############################################################################
//
// CoCalc: Collaborative web-based calculation
// Copyright (C) 2017, Sagemath Inc.
// AGPLv3
//
//##############################################################################

/*
Custom Prop Validation for immutable.js types, so they work just like other
React prop-types.

FUTURE: Put prop validation code in a debug area so that it doesn't get loaded for production

In addition to React Prop checks, we implement the following type checkers:
immutable,
immutable.List,
immutable.Map,
immutable.Set,
immutable.Stack,
which may be chained with .isRequired just like normal React prop checks

Additional validations may be added with the following signature
rtypes.custom_checker_name<function (
        props,
        propName,
        componentName,
        location,
        propFullName,
        secret
    ) => <Error-Like-Object or null>
>
Check React lib to see if this has changed.

*/

const check_is_immutable = function(
  props,
  propName,
  componentName,
  location,
  propFullName
) {
  if (componentName == null) {
    componentName = "ANONYMOUS";
  }
  if (props[propName] == null || props[propName].toJS != null) {
    return null;
  } else {
    const type = typeof props[propName];
    return new Error(
      `Invalid prop \`${propName}\` of` +
        ` type ${type} supplied to` +
        ` \`${componentName}\`, expected an immutable collection or frozen object.`
    );
  }
};

const allow_isRequired = function(validate) {
  const check_type = function(
    isRequired,
    props,
    propName,
    componentName,
    location
  ) {
    if (componentName == null) {
      componentName = "ANONYMOUS";
    }
    if (props[propName] == null && isRequired) {
      return new Error(
        `Required prop \`${propName}\` was not specified in \`${componentName}\``
      );
    }
    return validate(props, propName, componentName, location);
  };

  const chainedCheckType = check_type.bind(null, false);
  chainedCheckType.isRequired = check_type.bind(null, true);
  chainedCheckType.isRequired.category = "IMMUTABLE";
  chainedCheckType.category = "IMMUTABLE";

  return chainedCheckType;
};

const create_immutable_type_required_chain = function(validate) {
  const check_type = function(
    immutable_type_name,
    props,
    propName,
    componentName
  ) {
    if (componentName == null) {
      componentName = "ANONYMOUS";
    }
    if (immutable_type_name && props[propName] != null) {
      const T = immutable_type_name;
      if (props[propName].toJS == null) {
        return new Error(
          `NOT EVEN IMMUTABLE, wanted immutable.${T} ${props}, ${propName}`
        );
      }
      if (require("immutable")[`${T}`][`is${T}`](props[propName])) {
        return null;
      } else {
        return new Error(
          `Component \`${componentName}\`` +
            ` expected ${propName} to be an immutable.${T}` +
            ` but was supplied ${props[propName]}`
        );
      }
    } else {
      return validate(props, propName, componentName, location);
    }
  };

  // To add more immutable.js types, mimic code below.
  const check_immutable_chain = allow_isRequired(
    check_type.bind(null, undefined)
  );
  check_immutable_chain.Map = allow_isRequired(check_type.bind(null, "Map"));
  check_immutable_chain.List = allow_isRequired(check_type.bind(null, "List"));
  check_immutable_chain.Set = allow_isRequired(check_type.bind(null, "Set"));
  check_immutable_chain.Stack = allow_isRequired(
    check_type.bind(null, "Stack")
  );
  check_immutable_chain.category = "IMMUTABLE";

  return check_immutable_chain;
};

exports.immutable = create_immutable_type_required_chain(check_is_immutable);
