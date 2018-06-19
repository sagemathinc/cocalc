import { Store } from "../Store";
import { redux } from "../../smc-react";

// Basic Store
export interface bakeryState {
  cake: string;
  pie: string;
}

export const simple = "simple_store";

export const init_state: bakeryState = {
  cake: "chocolate",
  pie: "pizza"
};

redux.createStore(simple, Store, init_state);

// Do this
let alt_store: Store<bakeryState> | undefined = redux.getStore(simple);
if (alt_store != undefined) {
  alt_store.get("pie");
}

// Don't do this
let store = redux.getStore<bakeryState, Store<bakeryState>>(simple);

// get must take a parameter defined by your state interface
if (store != undefined) {
  store.get("pie");
}

// The following should error!
// store.get("pi");

//
// More complex example
//
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
}

class cafeStore extends Store<cafeState> {
  // We don't really use many functions on stores now but here's what it would look like...
  subTotal(drinkCount: Partial<{ [P in drinkTypes]: number }>): number {
    let total: number = 0;
    for (let item in drinkCount) {
      let cost = this.get("costs");
      if (cost !== undefined && cost[item]) {
        total = total + cost[item] * drinkCount[item];
      }
    }
    return total;
  }
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
  }
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
