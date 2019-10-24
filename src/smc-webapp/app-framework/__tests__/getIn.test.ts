/**
 *  Need to test permutations of (at all depths):
 *  TypedMap -> immutable.List -> immutable.Map
 *
 */

import { expectType } from "tsd";
import * as Immutable from "immutable";
import { TypedCollectionMethods } from "../immutable-types";
import { TypedMap } from "../TypedMap";

// TODO: Iterate through appropriate base types
type BASE = string;
const assign: BASE = "0";

type GetIn<T> = TypedCollectionMethods<T>["getIn"];
const STUB = (() => null) as any; // No implementation

// Seems trivial an unecessary but imagine a variable array that may turn
// out to have only one arg. We still want to type that correctly.
describe("length 1", () => {
  test("[obj]", () => {
    type T = { str: BASE };
    const getIn: GetIn<T> = STUB;
    let test = getIn(["str"]);
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });
  test("[TypedMap]", () => {
    type T = TypedMap<{ str: BASE }>;
    const getIn: GetIn<T> = STUB;
    let test = getIn(["str"]);
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });
  test("[Array]", () => {
    type T = BASE[];
    const getIn: GetIn<T> = STUB;
    let test = getIn([0]);
    test = assign;
    expectType<BASE>(test);
  });
  test("[List]", () => {
    type T = Immutable.List<BASE>;
    const getIn: GetIn<T> = STUB;
    let test = getIn([0]);
    test = assign;
    expectType<BASE>(test);
  });
  test("[Map]", () => {
    type T = Immutable.Map<string, BASE>;
    const getIn: GetIn<T> = STUB;
    let test = getIn(["anystr"]);
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });
});

/**
 * Doesn't support top level NOT object literal or array
 * when more than 1 deep ¯\_(ツ)_/¯
 */
describe("length 2", () => {
  test("[obj, obj]", () => {
    type T = { foo: { str: BASE } };
    const getIn: GetIn<T> = STUB;
    let test = getIn(["foo", "str"]);
    // Ensures our assign is the same type as test
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });
  test("[obj, TypedMap]", () => {
    type T = { foo: TypedMap<{ str: BASE }> };
    const getIn: GetIn<T> = STUB;
    let test = getIn(["foo", "str"]);
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });
  test("[obj, List]", () => {
    type T = { foo: Immutable.List<BASE> };
    const getIn: GetIn<T> = STUB;
    let test = getIn(["foo", 0]);
    test = assign;
    expectType<BASE>(test);
  });
  test("[obj, Array]", () => {
    type T = { foo: BASE[] };
    const getIn: GetIn<T> = STUB;
    let test = getIn(["foo", 0]);
    test = assign;
    expectType<BASE>(test);
  });
  test("[obj, Map]", () => {
    type T = { foo: Immutable.Map<string, BASE> };
    const getIn: GetIn<T> = STUB;
    let test = getIn(["foo", "anystr"]);
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });

  test("[Array, obj]", () => {
    type T = { str: BASE }[];
    const getIn: GetIn<T> = STUB;
    let test = getIn([0, "str"]);
    // Ensures our assign is the same type as test
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });
  test("[Array, TypedMap]", () => {
    type T = TypedMap<{ str: BASE }>[];
    const getIn: GetIn<T> = STUB;
    let test = getIn([0, "str"]);
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });
  test("[Array, List]", () => {
    type T = Immutable.List<BASE>[];
    const getIn: GetIn<T> = STUB;
    let test = getIn([0, 0]);
    test = assign;
    expectType<BASE>(test);
  });
  test("[Array, Array]", () => {
    type T = BASE[][];
    const getIn: GetIn<T> = STUB;
    let test = getIn([0, 0]);
    test = assign;
    expectType<BASE>(test);
  });
  test("[Array, Map]", () => {
    type T = Immutable.Map<string, BASE>[];
    const getIn: GetIn<T> = STUB;
    let test = getIn([0, "anystr"]);
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });
});
