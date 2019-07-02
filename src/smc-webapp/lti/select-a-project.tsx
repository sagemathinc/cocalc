import * as React from "react";
import { Map } from "immutable";
import { TypedMap } from "../app-framework/TypedMap";

export interface Props {
  ProjectList: Map<string, TypedMap<{}>>;
}
