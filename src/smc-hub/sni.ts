import * as sanitizeHtml from "sanitize-html";

function escape_email_body(body: string, allow_urls: boolean): string {
  // in particular, no img and no anchor a
  const allowedTags: string[] = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "p",
    "ul",
    "ol",
    "nl",
    "li",
    "b",
    "i",
    "strong",
    "em",
    "strike",
    "code",
    "hr",
    "br",
    "div",
    "table",
    "thead",
    "caption",
    "tbody",
    "tr",
    "th",
    "td",
    "pre"
  ];
  if (allow_urls) {
    allowedTags.push("a");
  }
  return sanitizeHtml(body, { allowedTags });
}

console.log(escape_email_body("<div>hi<a href='http://cocalc.com'>link</a>", false));
