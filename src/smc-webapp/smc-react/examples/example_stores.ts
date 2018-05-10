import { Store, store_definition } from "../Store";
import { redux } from "../../smc-react";

// Basic Store
export interface bakeryState extends store_definition {
  cake: string;
  pie: string;
}

export const simple = "simple_store";

export const init_state: bakeryState = {
  name: simple,
  cake: "chocolate",
  pie: "pizza"
};

redux.createStore(simple, Store, init_state);

let store = redux.getStore<bakeryState, Store<bakeryState>>(simple);

let alt_store: Store<bakeryState> = redux.getStore(simple);
alt_store.get("pie");

// get must take a parameter defined by your state interface
store.get("pie");

// The following should error!
// store.get("caek");

//
// More complex example
//
type drinkTypes = "mocha" | "cappucccino" | "latte";

interface CoffeeState extends store_definition {
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

class CoffeeStore extends Store<CoffeeState> {
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

let init_coffee_store_state: CoffeeState = {
  name: "coffeeStore",
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

redux.createStore("coffeeStore", CoffeeStore, init_coffee_store_state);

let coffeestore = redux.getStore<CoffeeState, CoffeeStore>("coffeeStore");
let costs = coffeestore.get("costs");
costs;

coffeestore.getIn(["costs", "mocha"]);

// Errors
// coffeestore.getIn(["people", "mocha"]);
// coffeestore.getIn(["people", "cleaners", "shifts", "length"]);

// Interesting...
coffeestore.getIn(["drinks", "length"]);
let alt_complex_store: CoffeeStore = redux.getStore("thing");
let alt_costs = alt_complex_store.get("costs");
alt_costs;
