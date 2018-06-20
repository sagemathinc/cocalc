import { Store } from "../Store";
import { redux } from "../../smc-react";
import { literal } from "../literal";

// Basic Store
export interface bakeryState {
  cake: string;
  pie: string;
}

export const init_state: bakeryState = {
  cake: "chocolate",
  pie: "pizza"
};

const NAME = "simple";
redux.createStore(NAME, Store, init_state);

// Do this
let store0: Store<bakeryState> | undefined = redux.getStore(NAME);

// Don't do this
let store1 = redux.getStore<bakeryState, Store<bakeryState>>(NAME);

// A store with a computed value

/*
# Using Selectors and computed values

1. In State of Store<State>, define what the selector returns
2. In init, define what the default state ought to be
3. In the selectors property of the Store, define dependencies and the function

*If you have any questions, ask J3 how this works* 
*/
type drinkTypes = "mocha" | "cappucccino" | "latte";

export interface cafeState {
  drinks: drinkTypes[];
  costs: Partial<{ [P in drinkTypes]: number }>;
  people: {
    cleaners: {
      shifts: string[];
    };
    baristas: {
      shifts: string[];
    };
  };
  order_amount: Partial<{ [P in drinkTypes]: number }>;
  subTotal: number;
}

class cafeStore extends Store<cafeState> {
  selectors = {
    subTotal: {
      dependencies: literal(["order_amount", "costs"]),
      fn: () => {
        let total: number = 0;
        for (let item in this.get("order_amount")) {
          let cost = this.get("costs");
          if (cost !== undefined && cost[item]) {
            total = total + cost[item] * this.get("order_amount")[item];
          }
        }
        return total;
      }
    }
  };
}

let init_cafe_store_state: cafeState = {
  drinks: ["mocha", "latte"],
  costs: {
    mocha: 2
  },
  people: {
    cleaners: {
      shifts: ["Alice", "Bob"]
    },
    baristas: {
      shifts: ["Frank", "Melissa"]
    }
  },
  order_amount: {},
  subTotal: 0
};

redux.createStore("cafeStore", cafeStore, init_cafe_store_state);

let cafestore: cafeStore | undefined = redux.getStore("cafeStore");

if (cafestore != undefined) {
  let costs = cafestore.get("costs");
  costs;

  cafestore.getIn(["people", "cleaners"]);

  // Errors
  // cafestore.getIn(["people", "mocha"]);
  // cafestore.getIn(["people", "cleaners", "shifts", "length"]);
  //   Use cafestore.unsafe_getIn(...) to escape getIn restrictions

  // Interesting...
  cafestore.getIn(["drinks", "length"]);
}
