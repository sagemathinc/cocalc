import { TypedMap } from "../TypedMap";

test("Composition", () => {
  type Action =
    | {
        type: "a";
      }
    | {
        type2: "b";
      };

  type ImmutableAction = TypedMap<Action>;
  const Action: ImmutableAction = "" as any;
  const m = Action.get("type");
  return m;
});

test("Composition2", () => {
  type Parent = {
    action: Action;
  };
  type Action =
    | {
        type: "a";
      }
    | {
        type2: "b";
      };

  type ImmutableParent = TypedMap<Parent>;
  const A: ImmutableParent = "" as any;
  const m = A.get("action");
  //const q = m.get("type") // If parent holds a type2, this is unsafe!
  return m;
});
