import { search_match, search_split } from "@cocalc/util/misc";


// Filter `option.label` match the user type `input`
export function filterOption(
  input: string,
  option: { label: string; value: string; search: string },
) {
  const terms = search_split(input.toLowerCase());
  return search_match((option?.search ?? "").toLowerCase(), terms);
}
