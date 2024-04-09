export function getHome(home?: string): string {
  return home ?? process.env.HOME ?? "/tmp";
}
