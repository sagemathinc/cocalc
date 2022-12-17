import { createElement, FC } from "react";
import { RenderSpec } from "@cocalc/util/db-schema";

import "./accounts";
import "./email-address";
import "./fallback";
import "./image";
import "./json";
import "./markdown";
import "./percent";
import "./project-link";
import "./purchased";
import "./text";
import "./timestamp";
import "./uuid";

// register a react component as being able to render a given RenderSpec

interface Props {
  field: string;
  obj: object;
}

interface Props2 extends Props {
  spec: RenderSpec;
}

let renderers: { spec: RenderSpec; component: FC<Props2> }[];
export function register(spec: RenderSpec, component: FC<Props2>) {
  if (typeof renderers == "undefined") {
    renderers = [{ spec, component }];
  } else {
    renderers.push({ spec, component });
  }
}

export function getRegisteredRenderer(spec: RenderSpec): FC<Props> {
  let n = -1;
  let C: FC<Props2> | null = null;
  // look for match with most matching keys, e.g., {type:'text', markdown:true} counts higher than {type:'text'}.
  for (const { spec: rspec, component } of renderers) {
    if (providesRenderer(spec, rspec) && Object.keys(rspec).length > n) {
      n = Object.keys(rspec).length;
      C = component;
    }
  }
  if (C != null) {
    return ({ obj, field }) =>
      createElement(C as FC<Props2>, { obj, field, spec });
  }
  throw Error(`no rendererer for spec ${JSON.stringify(spec)} found`);
}

function providesRenderer(spec: RenderSpec, rspec: RenderSpec): boolean {
  let match = true;
  for (const key in rspec) {
    let a = spec[key];
    const b = rspec[key];
    if (typeof b == "boolean") {
      a = !!a;
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
