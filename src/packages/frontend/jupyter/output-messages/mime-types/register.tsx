import React from "react";
import { STDERR_STYLE } from "../style";
import { Map } from "immutable";
import type { JupyterActions } from "../../browser-actions";

export interface DataProps {
  message: Map<string, any>;
  project_id?: string;
  directory?: string;
  // id?: string;
  actions?: JupyterActions;
  name?: string; // name of redux store...
  trust?: boolean;
}

export interface HandlerProps {
  value: any;
  type: string;
  data: Map<string, any>;
  message: Map<string, any>;
  project_id?: string;
  directory?: string;
  actions?: JupyterActions;
  name?: string;
  trust?: boolean;
}

type Handler = React.FC<HandlerProps>;

const HANDLERS: { [typeRegexp: string]: Handler } = {};

export default function register(typeRegexp: string, handler: Handler): void {
  HANDLERS[typeRegexp] = handler;
}

const FallbackHandler: React.FC<HandlerProps> = ({ type }) => {
  return <div style={STDERR_STYLE}>MIME type {type} not supported</div>;
};

export function getHandler(type: string): Handler {
  const h = HANDLERS[type];
  if (h != null) return h;
  for (const typeRegexp in HANDLERS) {
    if (type.match("^" + typeRegexp + "$")) {
      return HANDLERS[typeRegexp];
    }
  }
  return FallbackHandler;
}

export function hasHandler(type: string): boolean {
  if (HANDLERS[type] != null) return true;
  for (const typeRegexp in HANDLERS) {
    if (type.match("^" + typeRegexp + "$")) return true;
  }
  return false;
}
