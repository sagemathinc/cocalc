import { expectType } from "tsd";
import * as immutable from "immutable";
import { TypedMap } from "../TypedMap";
import { DeepImmutable } from "../immutable-types";

test("Successfully converts a complex object", () => {
  interface State {
    foo: { 
      bar: string[];
      bar2?: { a?: number[]; b: number; c: number };
      map: immutable.Map<string, any>;
      list: immutable.List<string>;
      typed_map: TypedMap<{ ok: string }>;
      Date: Date;
      Map: Map<any, any>;
      Set: Set<any>;
      WeakMap: WeakMap<object, any>;
      WeakSet: WeakSet<any>;
      Promise: Promise<any>;
      ArrayBuffer: ArrayBuffer;
    };
  }
  let result: DeepImmutable<State> = "" as any;
  
  type FullConvert = TypedMap<{
    foo: TypedMap<{
      bar: immutable.List<string>;
      bar2?: TypedMap<{ a?: immutable.List<number>; b: number; c: number }>;
      map: immutable.Map<string, any>;
      list: immutable.List<string>;
      typed_map: TypedMap<{ ok: string }>;
      Date: Date;
      Map: Map<any, any>;
      Set: Set<any>;
      WeakMap: WeakMap<object, any>;
      WeakSet: WeakSet<any>;
      Promise: Promise<any>;
      ArrayBuffer: ArrayBuffer;
    }>;
  }>
  
  expectType<FullConvert>(result);
})
