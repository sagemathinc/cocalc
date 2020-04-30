// redirect /[uuid] and /[uuid]?query=123 to /[uuid]/ and /[uuid]/?query=123
export function redirect_to_directory(req, res) {
  const query: string = req.url.slice(req.path.length);
  return res.redirect(301, req.baseUrl + req.path + "/" + query);
}

export function path_to_files(path: string, project_id: string): string {
  return path.replace("[project_id]", project_id);
}
