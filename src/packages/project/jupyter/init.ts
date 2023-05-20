/*
Initialize some functionality related to using Jupyter in a cocalc project.
*/

import { nbconvert } from "./convert";
import { initNbconvert } from "./jupyter";

export default function init() {
  initNbconvert(nbconvert);
}
