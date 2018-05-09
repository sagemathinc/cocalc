import { redux, Actions } from "../../smc-react";


// Basic Store
interface bakeryState {
  cake: string;
  pie: string;
}

let init_state: bakeryState = {
  cake: "chocolate",
  pie: "pizza"
};

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
}

let actions = redux.createActions("test", bakeryActions, init_state)
actions.change_pie("Savory")