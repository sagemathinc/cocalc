/*
Note that this doesn't actually use upstream nbconvert itself at all!

- pdf:  takes html, then uses headless chrome via
  chromium-browser or google-chrome, if installed to convert to pdf
*/

export default async function htmlToPdf(path: string): Promise<string> {
  

}
