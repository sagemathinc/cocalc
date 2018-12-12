/* From https://stackoverflow.com/questions/3277369/how-to-simulate-a-click-by-using-x-y-coordinates-in-javascript */

export function dblclick(x: number, y: number): void {
  var ev = new MouseEvent("dblclick", {
    view: window,
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y
  })

  var element = document.elementFromPoint(x, y);
  if (element != undefined) {
    element.dispatchEvent(ev);
  }
}
