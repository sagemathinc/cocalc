import { apiKey } from "@cocalc/backend/data";
import { siteUrl } from "./urls";
import { join } from "path";

export async function apiCall(endpoint: string, params: object): Promise<any> {
  const url = siteUrl(join("api", endpoint));

  let headers = new Headers();
  headers.append("Authorization", "Basic " + btoa(apiKey + ":"));
  headers.append("Content-Type", "application/json");

  const response = await fetch(url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(params),
  });

  let res = await response.json();
  if (res?.event == "error") {
    throw Error(res.error ?? "error");
  }
  delete res.id;
  delete res.event;
  return res;
}
