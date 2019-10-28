import { expectType } from "tsd";
import { Store } from "../Store";
import { DeepImmutable } from "../immutable-types";
import { AppRedux } from "../../app-framework";

test("Mapping with maybes in state", () => {
  interface State {
    deep?: { values: { cake: string } };
  }
  const redux = new AppRedux();

  const one_maybes = new Store<State>("", redux);

  let withMaybeValues1 = one_maybes.getIn(["deep"]);
  withMaybeValues1 = undefined; // Expect Assignable
  expectType<DeepImmutable<{ values: { cake: string } } | undefined>>(
    withMaybeValues1
  );

  let withMaybeValues2 = one_maybes.getIn(["deep", "values"]);
  withMaybeValues2 = undefined; // Expect Assignable
  expectType<DeepImmutable<{ cake: string } | undefined>>(withMaybeValues2);

  let withMaybeValues3 = one_maybes.getIn(["deep", "values", "cake"]);
  withMaybeValues3 = undefined; // Expect Assignable
  expectType<string | undefined>(withMaybeValues3);
});

test("Mapping with no maybes in State", () => {
  interface State {
    deep: { values: { cake: string } };
  }

  const redux = new AppRedux();
  const no_maybes = new Store<State>("", redux);

  let value1 = no_maybes.getIn(["deep"]);
  expectType<DeepImmutable<{ values: { cake: string } }>>(value1);

  let value2 = no_maybes.getIn(["deep", "values"]);
  expectType<DeepImmutable<{ cake: string }>>(value2);

  let value3 = no_maybes.getIn(["deep", "values", "cake"]);
  expectType<string>(value3);
});
