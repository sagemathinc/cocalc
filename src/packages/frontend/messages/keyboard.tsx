/*
When this component is mounted and no text area is focused,
then keyboard shortcuts for navigating messages work.

https://support.google.com/mail/answer/6594?hl=en&authuser=1#zippy=%2Cjumping%2Cthreadlist-selection%2Cnavigation%2Cactions
*/

import { useEffect } from "react";
import { redux } from "@cocalc/frontend/app-framework";

function handler(e) {
  if ($(":focus").length > 0) {
    // never use this handler if something is focused.
    return;
  }
  // obviously dumb -- use a map instead!
  let name = "";
  switch (e.key) {
    case "r":
      name = "reply";
      break;
    case "a":
      name = "reply-all";
      break;
    case "f":
      name = "forward";
      break;
    case "Enter":
    case "o":
      name = "open";
      break;
    case "u":
      name = "back-to-threadlist";
      break;
    case "ArrowDown":
    case "j":
      name = "down";
      break;

    case "ArrowUp":
    case "k":
      name = "up";
      break;

    case "e": // official
    case "y": // what I use and seems missing but it works for me in gmail (?)
      name = "archive";
      break;

    case "x":
      name = "select-conversation";
      break;

    case "#":
      name = "delete";
      break;

    case "s":
      name = "toggle-star";
      break;
      
    case "l":
      name = "toggle-like";
      break;

    default:
    //console.log(e);
  }
  if (name) {
    redux.getActions("messages").command(name);
  }
}

export default function KeyboardShortcuts() {
  useEffect(() => {
    redux.getActions("page").set_active_key_handler(handler);
    return () => {
      redux.getActions("page").erase_active_key_handler(handler);
    };
  }, []);

  return null;
}
