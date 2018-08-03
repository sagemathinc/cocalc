import { Store } from "../Store";
import { redux, Actions } from "../../app-framework";

import { bakeryState } from "./example_stores";

class cafeActions extends Actions<bakeryState> {
  change_pie(new_pie: string): void {
    this.setState({ pie: new_pie });

    // Errors

    // this.setState({pie: "Savory"}, () => console.log("callback"));
    // Expected 1 arguments, but got 2

    // this.setState({pie: 3});
    // Type 'number' is not assignable to type 'string | undefined'.

    // this.setState({"cashier": "Jill"});
    // '"cashier"' does not exist in type 'Partial<{ cake: string; pie: string; }>'
  }

  get_store(): Store<bakeryState> | undefined {
    return this.redux.getStore<bakeryState, Store<bakeryState>>(this.name);
  }
}

let actions = redux.createActions("coffeeStore", cafeActions);
actions.change_pie("Savory");
