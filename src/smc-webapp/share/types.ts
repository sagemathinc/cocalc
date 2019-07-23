export interface Author {
  name: string;
  account_id: string;
}

export type IsPublicFunction = (project_id: string, path: string) => boolean;
