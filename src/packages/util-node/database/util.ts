export function timeInSeconds(field: string, asField?: string): string {
  return ` EXTRACT(EPOCH FROM ${field})*1000 as ${asField ?? field} `;
}
