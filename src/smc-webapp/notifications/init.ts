import { AppRedux } from "../app-framework";
import { init as init_mentions } from "./mentions";

export function init(redux: AppRedux) {
  init_mentions(redux);
}
