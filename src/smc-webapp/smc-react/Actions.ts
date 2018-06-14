import { AppRedux } from "../smc-react";

// NOTE: it is intentional that there is no get method.  Instead, get data
// from stores.  The table will set stores (via creating actions) as
// needed when it changes.
export class Actions<T> {
  constructor(public name: string, protected redux: AppRedux) {
    if (this.name == null) {
      throw Error("name must be defined");
    }
    if (this.redux == null) {
      throw Error("redux must be defined");
    }
  }

  setState = (obj: Partial<{ [P in keyof T]: T[P] }>): void => {
    console.log(`Setting state to ${JSON.stringify(obj)} `);
    // console.trace()
    if (this.redux.getStore(this.name) == undefined) {
      console.warn(`${this.name} has an undefined store`);
      return;
    }
    this.redux._set_state({ [this.name]: obj });
    console.log("This redux is:", this.redux._redux_store.getState().get(this.name).toJS())
  };

  destroy = (): void => {
    this.redux.removeActions(this.name);
  };
}
