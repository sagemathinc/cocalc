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

const HANDLERS: { [type: string]: Handler } = {};

export default function register(type: string, handler: Handler): void {
  HANDLERS[type] = handler;
}

const FallbackHandler: React.FC<HandlerProps> = ({ type }) => {
  return <div style={STDERR_STYLE}>MIME type {type} not supported</div>;
};

export function getHandler(type: string): Handler {
  return HANDLERS[type] ?? FallbackHandler;
}

export function hasHandler(type: string): boolean {
  return HANDLERS[type] != null;
}
