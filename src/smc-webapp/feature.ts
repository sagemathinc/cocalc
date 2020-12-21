/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Client device features and capabilities.

declare const DEBUG: boolean;

let IS_MOBILE,
  IS_TOUCH,
  IS_IPAD,
  IS_IOS,
  isMobile,
  get_browser,
  get_mobile,
  is_responsive_mode;

if ((global as any).window != undefined) {
  // In a web browser.
  const window: any = (global as any).window;
  const navigator = window.navigator;
  let { $ } = window;

  isMobile = {
    Android() {
      return !!(navigator != undefined
        ? navigator.userAgent.match(/Android/i)
        : undefined);
    },
    BlackBerry() {
      return !!(navigator != undefined
        ? navigator.userAgent.match(/BlackBerry/i)
        : undefined);
    },
    iOS() {
      return !!(navigator != undefined
        ? navigator.userAgent.match(/iPhone|iPad|iPod/i)
        : undefined);
    },
    Windows() {
      return !!(navigator != undefined
        ? navigator.userAgent.match(/IEMobile/i)
        : undefined);
    },
    tablet() {
      return (
        !!(navigator != undefined
          ? navigator.userAgent.match(/iPad/i)
          : undefined) ||
        !!(navigator != undefined
          ? navigator.userAgent.match(/Tablet/i)
          : undefined)
      );
    },
    any() {
      return (
        isMobile.Android() ||
        isMobile.BlackBerry() ||
        isMobile.iOS() ||
        isMobile.Windows()
      );
    },
  };

  if ($ == undefined) {
    // don't even have jQuery -- obviously won't have any features -- this happens, e.g., in node.js
    IS_MOBILE = false;
    $ = {};
  }

  if ($.browser == undefined) {
    $.browser = {};
  }

  let user_agent: string = "";
  if (navigator) {
    user_agent = navigator.userAgent.toLowerCase();
  }

  $.browser.chrome = /chrom(e|ium)/.test(user_agent);

  if ($.browser.chrome) {
    $(".webapp-chrome-only").show();
  }

  $.browser.opera =
    (!!window.opr && !!window.opr.addons) ||
    !!window.opera ||
    user_agent.indexOf(" OPR/") >= 0;
  $.browser.firefox = !$.browser.chrome && user_agent.indexOf("firefox") > 0;
  $.browser.safari = !$.browser.chrome && user_agent.indexOf("safari") > 0;
  $.browser.ie = !$.browser.chrome && user_agent.indexOf("windows") > 0;
  $.browser.blink = ($.browser.chrome || $.browser.opera) && !!window.CSS;
  $.browser.edge = /edge\/\d./i.test(user_agent);

  get_browser = function () {
    for (const k in $.browser) {
      const v = $.browser[k];
      if (v) {
        return k;
      }
    }
    return undefined;
  };

  get_mobile = function () {
    for (const k in isMobile) {
      const v = isMobile[k];
      if (v()) {
        return k;
      }
    }
    return undefined;
  };

  // returns true if the page is currently displayed in responsive mode (the window is less than 768px)
  // Use this because CSS and JS display different widths due to scrollbar
  is_responsive_mode = () => $(".webapp-responsive-mode-test").width() < 768;

  // MOBILE for us means "responsive skinny" and on a mobile device.
  // On iPad, where the screen is wide, we do not enable MOBILE, since that
  // currently disables things like chat completely.
  // See https://github.com/sagemathinc/cocalc/issues/1392
  IS_MOBILE = isMobile.any() && is_responsive_mode();

  // See https://stackoverflow.com/questions/56578799/tell-ipados-from-macos-on-the-web
  const isIpadOS =
    typeof navigator !== "undefined" &&
    navigator?.userAgent?.match(/Mac/) &&
    navigator.maxTouchPoints &&
    navigator.maxTouchPoints > 2;

  IS_IOS = isMobile.iOS();

  // NOTE: iOS is the operating system of ipads and iPadOS is the operating system of ipads.
  IS_IPAD =
    !IS_IOS &&
    (isIpadOS ||
      !!(typeof navigator !== "undefined" && navigator !== null
        ? navigator.userAgent.match(/iPad/i)
        : undefined));

  // IS_TOUCH for us means multitouch tablet or mobile, the point being that it
  // is mostly *only* touch, so not something like a Chromebook with a touch screen.
  IS_TOUCH = isMobile.tablet() || IS_MOBILE || isMobile.any() || IS_IPAD;

  // DEBUG
  // export IS_MOBILE = true

  // DEBUG is injected by webpack and its value is true if the '--debug' cmd line parameter is set.
  // You can use DEBUG anywhere in the webapp code!
  if (DEBUG) {
    console.log("DEBUG MODE:", DEBUG);
  }

  var cookies_and_local_storage = function () {
    if (navigator == undefined) {
      return;
    }
    const app = require("./app-framework");
    let page: any = undefined;
    if (app) {
      // How is this possibly undefined?
      page = app.redux ? app.redux.getActions("page") : undefined;
    }
    if (page == undefined) {
      // It's fine to wait until page has loaded and then some before showing a warning
      // to the user.  This is also necessary to ensure the page actions/store have been defined.
      setTimeout(cookies_and_local_storage, 2000);
      return;
    }

    // Check for cookies (see http://stackoverflow.com/questions/6125330/javascript-navigator-cookieenabled-browser-compatibility)
    if (!navigator.cookieEnabled) {
      page.show_cookie_warning();
    }

    // Check for local storage
    if (!require("smc-util/misc").has_local_storage()) {
      page.show_local_storage_warning();
    }
  };

  setTimeout(cookies_and_local_storage, 2000);
} else {
  // Backend.

  // TODO: maybe provide the full api?
  IS_MOBILE = IS_TOUCH = false;
}

export {
  IS_MOBILE,
  IS_TOUCH,
  IS_IPAD,
  IS_IOS,
  isMobile,
  is_responsive_mode,
  get_browser,
  get_mobile,
};
