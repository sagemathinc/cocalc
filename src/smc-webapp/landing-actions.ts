/*
 * Landing actions are certain "intentions" for specific actions,
 * which are triggerd upon starting the webapp.
 * They guide a user through a sequence of steps, probably with some logic.
 *
 * Motivating example number 1: a URL pointing to /app encodes a custom software image,
 * which guides someone through signing in/up and then presents a dialog to
 * create a new project with that software environment,
 * or – in case there is already a project with that environment,
 * because the user comes back again via the same link –
 * presents that project to open up.
 *
 * A similar example is crating a new project with the files from a specific "share".
 * This means, there is a link on a share server page, which makes the file(s) runnable
 * with the least amount of friction.
 */

import {QueryParams} from './misc_page2';

export function run() {
  console.log("landing-actions: query =", QueryParams.get_all());
}
