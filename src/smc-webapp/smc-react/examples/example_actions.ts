import { Store, store_definition } from "../Store"
import { redux, Actions } from "../../smc-react";

// Basic Store
interface bakeryState extends store_definition {
  cake: string;
  pie: string;
}

let init_state: bakeryState = {
  name: "bakery test store",
  cake: "chocolate",
  pie: "pizza"
};
redux.createStore("test", Store, init_state);

redux.getStore<bakeryState, Store<bakeryState>>("thing");

class bakeryActions extends Actions<bakeryState> {
  change_pie(new_pie: string): void {
    this.setState({pie: new_pie});

    // Errors

    // this.setState({pie: "Savory"}, () => console.log("callback"));
    // Expected 1 arguments, but got 2

    // this.setState({pie: 3});
    // Type 'number' is not assignable to type 'string | undefined'.

    // this.setState({"cashier": "Jill"});
    // '"cashier"' does not exist in type 'Partial<{ cake: string; pie: string; }>'
  }
  get_store(): Store<bakeryState> {
    return this.redux.getStore<bakeryState, Store<bakeryState>>(this.name);
  }
}

let actions = redux.createActions("test", bakeryActions, init_state);
actions.change_pie("Savory");

let eh: bakeryActions = redux.getActions("test");
eh.change_pie("Sweet");
