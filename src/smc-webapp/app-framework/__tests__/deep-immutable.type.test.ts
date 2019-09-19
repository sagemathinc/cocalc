import { expectType, expectError } from "tsd";
import * as immutable from "immutable";
import { TypedMap } from "../TypedMap";
import { DeepImmutable } from "../immutable-types";

function fromJS<T>(o: T): DeepImmutable<T> {
  return immutable.fromJS(o);
}

interface state {
  foo: {
    bar: string[];
    bar2?: { a?: number[]; b: number; c: number };
    map: immutable.Map<string, any>;
    list: immutable.List<string>;
    typed_map: TypedMap<{ ok: string }>;
    Date: Date;
    Map: Map<any, any>;
    Set: Set<any>;
    WeakMap: WeakMap<any, any>;
    WeakSet: WeakSet<any>;
    Promise: Promise<any>;
    ArrayBuffer: ArrayBuffer;
  };
}
let values: state = {} as any;
let result = fromJS(values)

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
    WeakMap: WeakMap<any, any>;
    WeakSet: WeakSet<any>;
    Promise: Promise<any>;
    ArrayBuffer: ArrayBuffer;
  }>;
}>

expectType<FullConvert>(result);