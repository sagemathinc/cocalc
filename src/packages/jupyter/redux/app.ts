import { AppRedux as AppReduxBase } from "@cocalc/util/redux/AppRedux";

export class AppRedux extends AppReduxBase {
  getProjectTable(_project_id: string, _name: string) {
    throw Error("not implemented");
  }
  getTable(_name: string) {
    throw Error("not implemented");
  }
  removeTable(_name: string): void {
    throw Error("not implemented");
  }
}

export const redux = new AppRedux();
