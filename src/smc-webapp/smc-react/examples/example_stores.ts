import {Store, store_definition} from "../Store"
import {redux} from "../../smc-react"

// Basic Store
interface bakeryState {
  cake: string;
  pie: string;
}

let init_state: bakeryState = {
  cake: "chocolate",
  pie: "pizza"
};

redux.createStore("test", init_state);

let store = redux.getStore<bakeryState>("thing");

// get must take a parameter defined by your state interface
store.get("pie")

// The following should error!
// store.get("caek");


//
// More complex example
//
type drinkTypes = "mocha" | "cappucccino" | "latte";

interface CoffeeState extends store_definition {
  drinks: drinkTypes[];
  costs: Partial<{ [P in drinkTypes]: number }>;
}

class CoffeeStore extends Store<CoffeeState> {
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
    mocha: 5
  }
};

redux.createStore<CoffeeState>("test", CoffeeStore, init_coffee_store_state);

let coffeestore = redux.getStore<CoffeeState>("thing");
let costs = coffeestore.get("costs");
costs;
