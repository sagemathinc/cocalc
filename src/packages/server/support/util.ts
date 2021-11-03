export function urlToUserURL(url?: string): string {
  return (url ?? "").replace("api/v2/tickets", "requests").replace(".json", "");
}
