/*
Initialize some functionality related to using Jupyter in a cocalc project.
*/

import { nbconvert } from "./convert";
import { initNbconvert } from "@cocalc/jupyter/kernel";

export default function init() {
  initNbconvert(nbconvert);
}
