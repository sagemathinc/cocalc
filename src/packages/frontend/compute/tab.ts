import {
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";

export type TabName = "compute-servers" | "cloud-filesystems" | "notebooks";

export function getServerTab(project_id): TabName | undefined {
  return (get_local_storage(`${project_id}-server-tab`) ?? undefined) as
    | TabName
    | undefined;
}

export function setServerTab(project_id, tab: TabName) {
  return set_local_storage(`${project_id}-server-tab`, tab);
}
