import { AppRedux } from "../smc-react-ts";

// NOTE: it is intentional that there is no get method.  Instead, get data
// from stores.  The table will set stores (via creating actions) as
// needed when it changes.

declare var DEBUG;

export class Actions<T> {
  constructor(public name: string, protected redux: AppRedux) {
    this.setState = this.setState.bind(this);
    this.destroy = this.destroy.bind(this);
    if (this.name == null) {
      throw Error("name must be defined");
    }
    if (this.redux == null) {
      throw Error("redux must be defined");
    }
  }

  setState(obj: Partial<{ [P in keyof T]: T[P] }>): void {
    if (DEBUG && this.redux.getStore(this.name).__converted) {
      for (let key in obj) {
        let descriptor = Object.getOwnPropertyDescriptor(
          this.redux.getStore(this.name),
          key
        );
        if (descriptor == undefined || !descriptor.get) {
          console.warn(
            `\`${key}\` is not declared in stateTypes of store name \`${
              this.name
            }\``
          );
        }
      }
    }
    this.redux._set_state({ [this.name]: obj });
  }

  destroy(): void {
    this.redux.removeActions(this.name);
  }
}
