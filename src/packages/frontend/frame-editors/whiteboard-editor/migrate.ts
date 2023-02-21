import { parseSyncdbFileUsingPageNumbers } from "./share/util";
import { uuid } from "@cocalc/util/misc";

export function migrateToNewPageNumbers(syncdoc) {
  const contents = syncdoc.to_str();
  const pages = parseSyncdbFileUsingPageNumbers(contents);
  // generate unique new page ids and objects
  const newPages: { id: string; type: "page"; data: { pos: number } }[] = [];
  for (let i = 0; i < Math.max(1, pages.length); i++) {
    let id = uuid().slice(0, 8);
    while (contents.includes(id)) {
      // dumb algorithm,  but this conversion is rare.
      id = uuid().slice(0, 8);
    }
    newPages.push({ id, type: "page", data: { pos: i } });
  }
  // update fix existing elements
  for (const page of pages) {
    for (const element of page) {
      element.page =
        newPages[(element.page as unknown as number) - 1]?.id ?? newPages[0].id;
    }
  }
  // write back all the elements and pages, were here Javascript is kind of eloquent:
  const newContents = [newPages, ...pages]
    .flat()
    .map((element) => JSON.stringify(element))
    .join("\n");
  syncdoc.from_str(newContents);
  syncdoc.commit();
}
