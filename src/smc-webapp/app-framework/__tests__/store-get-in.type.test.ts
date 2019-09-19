import { expectType } from "tsd";
import { Store } from "../Store";
import { DeepImmutable } from "../immutable-types";

interface State {
  deep?: { values: { cake: string } };
}

const one_maybes = new Store<State>("", {} as any);

let oMvalue1 = one_maybes.getIn(["deep"]);
expectType<DeepImmutable<{ values: { cake: string } } | undefined>>(oMvalue1);

let oMvalue2 = one_maybes.getIn(["deep", "values"]);
expectType<DeepImmutable<{ cake: string } | undefined>>(oMvalue2);

let oMvalue3 = one_maybes.getIn(["deep", "values", "cake"]);
expectType<string | undefined>(oMvalue3);

const no_maybes = new Store<{ deep: { values: { cake: string } } }>(
  "",
  {} as any
);

let value1 = no_maybes.getIn(["deep"]);
expectType<DeepImmutable<{ values: { cake: string } }>>(value1);

let value2 = no_maybes.getIn(["deep", "values"]);
expectType<DeepImmutable<{ cake: string }>>(value2);

let value3 = no_maybes.getIn(["deep", "values", "cake"]);
expectType<string>(value3);

