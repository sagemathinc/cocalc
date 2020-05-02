/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

(function() {
  var mode = CodeMirror.getMode({indentUnit: 2}, "ruby");
  function MT(name) { test.mode(name, mode, Array.prototype.slice.call(arguments, 1)); }

  MT("divide_equal_operator",
     "[variable bar] [operator /=] [variable foo]");

  MT("divide_equal_operator_no_spacing",
     "[variable foo][operator /=][number 42]");

})();
