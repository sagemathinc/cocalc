import { readFileSync } from "fs";

// redirect /[uuid] and /[uuid]?query=123 to /[uuid]/ and /[uuid]/?query=123
export function redirect_to_directory(req, res) {
  const query: string = req.url.slice(req.path.length);
  return res.redirect(301, req.baseUrl + req.path + "/" + query);
}

// This read the google analytics token from disk the first time, or returns undefined
// if no such token is defined.
let _google_analytics_token: string | null | undefined = undefined;
export function google_analytics_token(): string | undefined {
  if (_google_analytics_token != undefined) return _google_analytics_token;
  const filename: string =
    (process.env.SMC_ROOT != null ? process.env.SMC_ROOT : ".") +
    "/data/secrets/google_analytics";
  let ga: string | undefined = undefined;
  try {
    const s: Buffer = readFileSync(filename);
    ga = s.toString().trim();
    _google_analytics_token = ga;
  } catch (error) {
    _google_analytics_token = null;
  }
  console.log(`share/util/google_analytics_token: ${ga}`);
  return ga;
}

export function path_to_files(path: string, project_id: string): string {
  return path.replace("[project_id]", project_id);
}
