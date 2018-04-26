export const {
  React,
  ReactDOM,
  rclass,
  rtypes,
  Fragment
} = require("smc-webapp/smc-react");

import * as ReactOrig from "react";

export const Component = ReactOrig.Component;

export type Rendered = ReactOrig.ReactElement<any> | undefined;
