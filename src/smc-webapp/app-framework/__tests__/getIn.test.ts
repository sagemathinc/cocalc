/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
  test("[Array]", () => {
    type T = BASE[];
    const getIn: GetIn<T> = STUB;
    let test = getIn([0]);
    test = assign;
    expectType<BASE>(test);
  });
  test("[TypedMap]", () => {
    type T = TypedMap<{ str: BASE }>;
    const getIn: GetIn<T> = STUB;
    let test = getIn(["str"]);
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
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

describe("length 2", () => {
  test("[obj, obj]", () => {
    type T = { foo: { str: BASE } };
    const getIn: GetIn<T> = STUB;
    let test = getIn(["foo", "str"]);
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });
  test("[obj, Array]", () => {
    type T = { foo: BASE[] };
    const getIn: GetIn<T> = STUB;
    let test = getIn(["foo", 0]);
    test = assign;
    expectType<BASE>(test);
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

    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });
  test("[Array, Array]", () => {
    type T = BASE[][];
    const getIn: GetIn<T> = STUB;
    let test = getIn([0, 0]);
    test = assign;
    expectType<BASE>(test);
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
  test("[Array, Map]", () => {
    type T = Immutable.Map<string, BASE>[];
    const getIn: GetIn<T> = STUB;
    let test = getIn([0, "anystr"]);
    test = assign; // Checks against never
    expectType<BASE>(test); // Finally check against the BASE type again
  });
});

describe("length 3", () => {
  describe("object -> L3", () => {
    test("[obj, obj, obj]", () => {
      type T = { foo: { bar: { str: BASE } } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "bar", "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, Array]", () => {
      type T = { foo: { bar: BASE[] } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "bar", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, TypedMap]", () => {
      type T = { foo: { bar: TypedMap<{ str: BASE }> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "bar", "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, List]", () => {
      type T = { foo: { bar: Immutable.List<BASE> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "bar", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, Map]", () => {
      type T = { foo: { bar: Immutable.Map<string, BASE> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "bar", "anystr"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
  });

  describe("Array -> L3", () => {
    test("[obj, Array, obj]", () => {
      type T = { foo: { str: BASE }[] };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", 0, "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, Array, Array]", () => {
      type T = { foo: BASE[][] };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", 2, 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, Array, TypedMap]", () => {
      type T = { foo: TypedMap<{ str: BASE }>[] };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", 2, "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, Array, List]", () => {
      type T = { foo: Immutable.List<BASE>[] };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", 2, 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, Array, Map]", () => {
      type T = { foo: Immutable.Map<string, BASE>[] };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", 2, "anystr"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
  });

  describe("TypedMap -> L3", () => {
    test("[obj, TypedMap, obj]", () => {
      type T = { foo: TypedMap<{ bar: { str: BASE } }> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "bar", "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, TypedMap, Array]", () => {
      type T = { foo: TypedMap<{ bar: BASE[] }> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "bar", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, TypedMap, TypedMap]", () => {
      type T = { foo: TypedMap<{ bar: TypedMap<{ str: BASE }> }> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "bar", "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, TypedMap, List]", () => {
      type T = { foo: TypedMap<{ bar: Immutable.List<BASE> }> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "bar", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, TypedMap, Map]", () => {
      type T = { foo: TypedMap<{ bar: Immutable.Map<string, BASE> }> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "bar", "anystr"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
  });

  describe("List -> L3", () => {
    test("[obj, List, obj]", () => {
      type T = { foo: Immutable.List<{ str: BASE }> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", 0, "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, List, TypedMap]", () => {
      type T = { foo: Immutable.List<TypedMap<{ str: BASE }>> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", 0, "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, List, List]", () => {
      type T = { foo: Immutable.List<Immutable.List<BASE>> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", 0, 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, List, Array]", () => {
      type T = { foo: Immutable.List<BASE[]> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", 0, 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, List, Map]", () => {
      type T = { foo: Immutable.List<Immutable.Map<string, BASE>> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", 0, "anystr"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
  });

  describe("Map -> L3", () => {
    test("[obj, Map, obj]", () => {
      type T = { foo: Immutable.Map<string, { str: BASE }> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "anystr", "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, Map, TypedMap]", () => {
      type T = { foo: Immutable.Map<string, TypedMap<{ str: BASE }>> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "anystr", "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, Map, List]", () => {
      type T = { foo: Immutable.Map<string, Immutable.List<BASE>> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "anystr", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, Map, Array]", () => {
      type T = { foo: Immutable.Map<string, BASE[]> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "anystr", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, Map, Map]", () => {
      type T = { foo: Immutable.Map<string, Immutable.Map<string, BASE>> };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "anystr", "anystr"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
  });
});

describe("length 4", () => {
  describe("object -> L4", () => {
    test("[obj, obj, obj, obj]", () => {
      type T = { foo: { foo: { bar: { str: BASE } } } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "bar", "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, obj, Array]", () => {
      type T = { foo: { foo: { bar: BASE[] } } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "bar", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, obj, TypedMap]", () => {
      type T = { foo: { foo: { bar: TypedMap<{ str: BASE }> } } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "bar", "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, obj, List]", () => {
      type T = { foo: { foo: { bar: Immutable.List<BASE> } } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "bar", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, obj, Map]", () => {
      type T = { foo: { foo: { bar: Immutable.Map<string, BASE> } } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "bar", "anystr"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
  });

  describe("Array -> L4", () => {
    test("[obj, obj, Array, obj]", () => {
      type T = { foo: { foo: { str: BASE }[] } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", 0, "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, Array, Array]", () => {
      type T = { foo: { foo: BASE[][] } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", 2, 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, Array, TypedMap]", () => {
      type T = { foo: { foo: TypedMap<{ str: BASE }>[] } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", 2, "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, Array, List]", () => {
      type T = { foo: { foo: Immutable.List<BASE>[] } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", 2, 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, Array, Map]", () => {
      type T = { foo: { foo: Immutable.Map<string, BASE>[] } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", 2, "anystr"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
  });

  describe("TypedMap -> L4", () => {
    test("[obj, obj, TypedMap, obj]", () => {
      type T = { foo: { foo: TypedMap<{ bar: { str: BASE } }> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "bar", "str"]);

      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, TypedMap, Array]", () => {
      type T = { foo: { foo: TypedMap<{ bar: BASE[] }> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "bar", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, TypedMap, TypedMap]", () => {
      type T = { foo: { foo: TypedMap<{ bar: TypedMap<{ str: BASE }> }> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "bar", "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, TypedMap, List]", () => {
      type T = { foo: { foo: TypedMap<{ bar: Immutable.List<BASE> }> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "bar", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, TypedMap, Map]", () => {
      type T = { foo: { foo: TypedMap<{ bar: Immutable.Map<string, BASE> }> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "bar", "anystr"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
  });

  describe("List -> L4", () => {
    test("[obj, obj, List, obj]", () => {
      type T = { foo: { foo: Immutable.List<{ str: BASE }> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", 0, "str"]);

      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, List, TypedMap]", () => {
      type T = { foo: { foo: Immutable.List<TypedMap<{ str: BASE }>> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", 0, "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, List, List]", () => {
      type T = { foo: { foo: Immutable.List<Immutable.List<BASE>> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", 0, 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, List, Array]", () => {
      type T = { foo: { foo: Immutable.List<BASE[]> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", 0, 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, List, Map]", () => {
      type T = { foo: { foo: Immutable.List<Immutable.Map<string, BASE>> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", 0, "anystr"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
  });

  describe("Map -> L4", () => {
    test("[obj, obj, Map, obj]", () => {
      type T = { foo: { foo: Immutable.Map<string, { str: BASE }> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "anystr", "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, Map, TypedMap]", () => {
      type T = { foo: { foo: Immutable.Map<string, TypedMap<{ str: BASE }>> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "anystr", "str"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
    test("[obj, obj, Map, List]", () => {
      type T = { foo: { foo: Immutable.Map<string, Immutable.List<BASE>> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "anystr", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, Map, Array]", () => {
      type T = { foo: { foo: Immutable.Map<string, BASE[]> } };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "anystr", 0]);
      test = assign;
      expectType<BASE>(test);
    });
    test("[obj, obj, Map, Map]", () => {
      type T = {
        foo: { foo: Immutable.Map<string, Immutable.Map<string, BASE>> };
      };
      const getIn: GetIn<T> = STUB;
      let test = getIn(["foo", "foo", "anystr", "anystr"]);
      test = assign; // Checks against never
      expectType<BASE>(test); // Finally check against the BASE type again
    });
  });
});
