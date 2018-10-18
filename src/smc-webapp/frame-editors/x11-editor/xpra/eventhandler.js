/*
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * Copyright (c) 2011-2018, Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */

/*
 * Gets an array of event names based in input,
 * be it array or a comma separated string.
 */
const getEventNames = name =>
  name instanceof Array
    ? name
    : String(name)
        .replace(/\s+/g, "")
        .split(",");

/**
 * Event Handler
 *
 * @desc A standards compatible event handler (observer) with some sugar.
 */
export class EventHandler {
  /**
   * Create Event Handler
   * @param {String} [name] A name for logging
   */
  constructor(name = "undefined") {
    /**
     * The name of the handler
     * @type {String}
     */
    this.name = name;

    /**
     * Registered events
     * @type {Object}
     */
    this.events = {};
  }

  /**
   * Destroys all events
   */
  destroy() {
    this.events = {};
  }

  /**
   * Add an event handler
   *
   * You can supply an array of event names or a comma separated list with a string
   *
   * @param {String|String[]} name Event name
   * @param {Function} callback Callback function
   * @param {Object} [options] Options
   * @param {boolean} [options.persist] This even handler cannot be removed unless forced
   * @return {EventHandler} Returns current instance
   */
  on(name, callback, options = {}) {
    options = options || {};

    if (typeof callback !== "function") {
      throw new TypeError("Invalid callback");
    }

    getEventNames(name).forEach(n => {
      if (!this.events[n]) {
        this.events[n] = [];
      }

      this.events[n].push({ callback, options });
    });

    return this;
  }

  /**
   * Removes an event handler
   *
   * If no callback is provided, all events bound to given name will be removed.
   *
   * You can supply an array of event names or a comma separated list with a string
   *
   * @param {String|String[]} name Event name
   * @param {Function} [callback] Callback function
   * @param {boolean} [force=false] Forces removal even if set to persis
   * @return {EventHandler} Returns current instance
   */
  off(name, callback = null, force = false) {
    getEventNames(name)
      .filter(n => !!this.events[n])
      .forEach(n => {
        if (callback) {
          let i = this.events[n].length;
          while (i--) {
            const ev = this.events[n][i];
            const removable = !ev.options.persist || force;
            if (removable && ev.callback === callback) {
              this.events[n].splice(i, 1);
            }
          }
        } else {
          this.events[n] = force
            ? []
            : this.events[n].filter(({ options }) => options.persist !== true);
        }
      });

    return this;
  }

  /**
   * Emits an event
   *
   * You can supply an array of event names or a comma separated list with a string
   *
   * @param {String|String[]} name Event name
   * @param {*} [args] Arguments
   * @return {EventHandler} Returns current instance
   */
  emit(name, ...args) {
    getEventNames(name).forEach(n => {
      if (this.events[n]) {
        this.events[n].forEach(({ callback }) => callback(...args));
      }
    });

    return this;
  }
}
