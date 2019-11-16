import { Map } from "immutable";

export type UserMap = Map<string, any>; // TODO

export interface UsersState {
  user_map: UserMap;
}
