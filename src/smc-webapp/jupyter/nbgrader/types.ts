// See https://nbgrader.readthedocs.io/en/stable/contributor_guide/metadata.html

import { Map } from "immutable";

export interface Metadata {
  grade?: boolean;
  grade_id?: string;
  locked?: boolean;
  schema_version?: number;
  solution?: boolean;
  points?: number;
}

export type ImmutableMetadata = Map<string, any>;

