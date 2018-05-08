import { Store, store_definition } from "../Store";
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

let store = redux.createStore("test", init_state);



class bakeryActions extends Actions<bakeryState> {
  change_pie(new_pie: string): void {
    this.setState({pie: new_pie})
  }
}

let actions = redux.createActions("test", bakeryActions, init_state)
actions.change_pie("Savory")