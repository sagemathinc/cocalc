export interface Key {
  project_id: string;
  path: string;
  time: Date;
  target: string;
  fragment_id?: string;
}

export type Action = "ignore" | "notify" | "email" | "nothing";
