import {
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";

export function getServerTab(project_id): string | undefined {
  return (get_local_storage(`${project_id}-server-tab`) ?? undefined) as
    | string
    | undefined;
}

export function setServerTab(project_id, tab) {
  return set_local_storage(`${project_id}-server-tab`, tab);
}
