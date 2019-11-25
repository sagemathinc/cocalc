import { TypedMap } from "../../app-framework";

export type AvailableFeatures = TypedMap<{
  sage: boolean;
  latex: boolean;
  x11: boolean;
  rmd: boolean;
  jupyter_notebook: boolean;
  jupyter_lab: boolean;
}>;
