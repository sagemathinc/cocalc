import { TypedMap } from "../TypedMap";

test("Composition", () => {
  type Action =
    | {
        type: "a";
      }
    | {
        type2: "b";
      };
  
  type ImmutableAction = TypedMap<Action>
  let Action: ImmutableAction = "" as any;
  let m = Action.get("type")
  return m;
});

test("Composition2", () => {
  type Parent = {
    action: Action
  }
  type Action =
    | {
        type: "a";
      }
    | {
        type2: "b";
      };
  
  type ImmutableParent = TypedMap<Parent>
  let A: ImmutableParent = "" as any;
  let m = A.get("action")
  //const q = m.get("type") // If parent holds a type2, this is unsafe!
  return m;
});