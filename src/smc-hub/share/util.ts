import { readFileSync } from "fs";

// redirect /[uuid] and /[uuid]?query=123 to /[uuid]/ and /[uuid]/?query=123
export function redirect_to_directory(req, res) {
  const query: string = req.url.slice(req.path.length);
  return res.redirect(301, req.baseUrl + req.path + "/" + query);
}

// this read the google analytics token from disk -- or returns undefined

export function google_analytics_token(): string | undefined {
  const filename: string =
    (process.env.SMC_ROOT != null ? process.env.SMC_ROOT : ".") +
    "/data/secrets/google_analytics";
  let ga: string | undefined = undefined;
  try {
    const s: string = readFileSync(filename);
    ga = s.toString().trim();
  } catch (error) {}
  console.log(`share/util/google_analytics_token: ${ga}`);
  return ga;
}

export function path_to_files(path: string, project_id: string): string {
  return path.replace("[project_id]", project_id);
}
