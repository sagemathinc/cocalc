import { Element } from "./types";

/*
Convert the array of elements to a markdown string.
Elements have the following shape:

{x:number; y:number; str:string, page:string}

Elements can have lots of other fields but we completely ignore
all other fields. Also, we discard all elements that have
any of x, y, or str undefined or null.

For the remaining elements we first divide them up into pages.
For each page we sort lexicographically by [y,x] values, so
smaller y values are first, and we break ties by comparing x values.

The elements array also contains elements of the shape

   {data:{pos:number}, type:"page", id:string}

We sort these by data.pos, and use this sort to sort the
elements that were grouped by pages above.
*/

function compareElements(a: Element, b: Element): number {
  return a.y === b.y ? a.x - b.x : a.y - b.y;
}

function comparePages(a: Element, b: Element): number {
  return (a.data?.pos ?? 0) - (b.data?.pos ?? 0);
}

export function toMarkdown(elements: Element[]): string {
  // Filter out the elements without x, y, or str and group by pages
  const pageGroups: Record<string, Element[]> = {};
  const pages: Element[] = [];

  for (const element of elements) {
    if (element.type === "page") {
      pages.push(element);
    } else if (
      element.x !== null &&
      element.y !== null &&
      element.str !== null
    ) {
      if (!pageGroups[element.page ?? ""]) {
        pageGroups[element.page ?? ""] = [];
      }
      pageGroups[element.page ?? ""].push(element);
    }
  }

  // Sort pages by data.pos
  pages.sort(comparePages);

  // Convert page groups to sorted markdown string
  let markdown = "";
  for (const page of pages) {
    const pageElements = pageGroups[page.id];
    if (pageElements) {
      pageElements.sort(compareElements);
      const pageMarkdown = pageElements.map(elementToMarkdown).join("\n");
      markdown += pageMarkdown + "\n\n---\n\n\n";
    }
  }

  return markdown;
}

export function elementToMarkdown(element: Element): string {
  if (element.type == "code") {
    // todo -- what is the language mode?
    return "```\n" + element.str + "\n```";
  }
  return element.str ?? "";
}
