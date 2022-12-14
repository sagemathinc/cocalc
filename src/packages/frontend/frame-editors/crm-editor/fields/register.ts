import { FC } from "react";
import { RenderSpec } from "@cocalc/util/db-schema";

import "./text";
import "./timestamp";

// register a react component as being able to render a given RenderSpec
type RenderComponent = FC<Props>;
let renderers: { spec: RenderSpec; component: RenderComponent }[];
export function register(spec: RenderSpec, component: RenderComponent) {
  if (typeof renderers == "undefined") {
    renderers = [{ spec, component }];
  } else {
    renderers.push({ spec, component });
  }
}

export interface Props {
  field: string;
  obj: object;
}

export function getRegisteredRenderer(spec: RenderSpec): RenderComponent {
  let n = 0;
  let C: RenderComponent | null = null;
  // look for match with most matching keys, e.g., {type:'text', markdown:true} counts higher than {type:'text'}.
  for (const { spec: rspec, component } of renderers) {
    if (providesRenderer(spec, rspec) && Object.keys(rspec).length > n) {
      n = Object.keys(rspec).length;
      C = component;
    }
  }
  if (C != null) {
    return C;
  }
  throw Error(`no rendererer for spec ${JSON.stringify(spec)} found`);
}

function providesRenderer(spec: RenderSpec, rspec: RenderSpec): boolean {
  let match = true;
  for (const key in rspec) {
    let a = spec[key];
    const b = rspec[key];
    if (typeof b == "boolean") {
      a == !!a;
    }
    if (a != b) {
      match = false;
      break;
    }
  }
  if (match) {
    return true;
  }
  return false;
}
