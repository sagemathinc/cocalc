import { createElement, FC } from "react";
import { RenderSpec } from "@cocalc/util/db-schema";

// register a react component as being able to render a given RenderSpec

interface Props {
  field: string;
  obj: object;
  viewOnly?: boolean;
}

export interface RenderProps extends Props {
  spec: RenderSpec;
}

let renderers: { spec: RenderSpec; component: FC<RenderProps> }[];
export function render(spec: RenderSpec, component: FC<RenderProps>) {
  if (typeof renderers == "undefined") {
    renderers = [{ spec, component }];
  } else {
    renderers.push({ spec, component });
  }
}

export function getRenderer(spec: RenderSpec): FC<Props> {
  let n = -1;
  let C: FC<RenderProps> | null = null;
  // look for match with most matching keys, e.g., {type:'text', markdown:true} counts higher than {type:'text'}.
  for (const { spec: rspec, component } of renderers) {
    if (matches(spec, rspec) && Object.keys(rspec).length > n) {
      n = Object.keys(rspec).length;
      C = component;
    }
  }
  if (C != null) {
    return ({ obj, field, viewOnly }) =>
      createElement(C as FC<RenderProps>, { obj, field, spec, viewOnly });
  }
  throw Error(`no rendererer for spec ${JSON.stringify(spec)} found`);
}

type Sorter = (obj1, obj2) => number;
let sorters: { spec: RenderSpec; cmp: Sorter }[];
export function sorter(spec: RenderSpec, cmp: Sorter) {
  if (typeof sorters == "undefined") {
    sorters = [{ spec, cmp }];
  } else {
    sorters.push({ spec, cmp });
  }
}

export function getSorter(spec: RenderSpec): Sorter {
  let n = -1;
  let C: Sorter | null = null;
  // look for match with most matching keys,
  for (const { spec: rspec, cmp } of sorters) {
    if (matches(spec, rspec) && Object.keys(rspec).length > n) {
      n = Object.keys(rspec).length;
      C = cmp;
    }
  }
  if (C != null) {
    return C;
  }
  throw Error(`no sorter for spec ${JSON.stringify(spec)} found`);
}

function matches(spec: RenderSpec, rspec: RenderSpec): boolean {
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
