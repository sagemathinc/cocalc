import { join } from "path";
import apiClient from "@cocalc/frontend/client/api";

export default async function api(endpoint: string, args?: object) {
  return await apiClient(join("jupyter", endpoint), args);
}
