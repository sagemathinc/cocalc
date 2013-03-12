/*************************************************************
 *
 *  MathJax/extensions/fp.js
 *
 *  Implements Functional Programming library.
 *  
 *  ---------------------------------------------------------------------
 *  
 *  Copyright (c) 2011-2012 Isao Sonobe <sonoisa@gmail.com>.
 * 
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

MathJax.Hub.Register.StartupHook("End Extensions",function () {
  
  var FP = MathJax.Extension.fp = {
    version: "0.1"
  };
  
  /************ Matcher **************/
  FP.Matcher = MathJax.Object.Subclass({
    Init: function () { this.cases = []; },
    Case: function (klass, f) {
      this.cases.push([klass, f]);
      return this;
    },
    match: function (x) {
      if (x instanceof Object && "isa" in x) {
        var i, count, klass, op;
        i = 0;
        count = this.cases.length;
        while (i < count) {
          klass = this.cases[i][0];
          if (x.isa(klass)) {
            op = klass.unapply(x);
            if (op.isDefined) {
              return this.cases[i][1](op.get);
            }
          }
          i = i + 1;
        }
      }
      throw FP.MatchError(x);
    }
  });
  
  /************ Option **************/
  FP.Option = MathJax.Object.Subclass({});

  FP.Option.Some = FP.Option.Subclass({
    Init: function (value) {
      this.get = value;
    },
    isEmpty: false,
    isDefined: true,
    getOrElse: function (ignore) { return this.get; },
    flatMap: function (k) {
      return k(this.get);
    },
    map: function (f) {
      return FP.Option.Some(f(this.get));
    },
    foreach: function (f) {
      f(this.get);
    },
    toString: function () {
      return "Some(" + this.get + ")";
    }
  }, {
    unapply: function (x) { return FP.Option.Some(x.get); }
  });

  FP.Option.None = FP.Option.Subclass({
    Init: function () {},
    isEmpty: true,
    isDefined: false,
    getOrElse: function (value) { return value; },
    flatMap: function (k) { return this; },
    foreach: function (f) {},
    map: function (k) { return this; },
    toString: function () { return "None"; }
  }, {
    unapply: function (x) { return FP.Option.Some(x); }
  });

  FP.Option.Augment({}, {
    empty: FP.Option.None()
  });


  /************ List **************/
  FP.List = MathJax.Object.Subclass({});

  FP.List.Cons = FP.List.Subclass({
    Init: function (head, tail) {
      this.head = head;
      this.tail = tail;
    },
    isEmpty: false,
    at: function (index) {
      if (index < 0 || index >= this.length()) {
        throw Error("no such element at " + index + ". index must be lower than " + this.length() + ".");
      }
      var t = this;
      for (var i = 0; i < index; i++) {
        t = t.tail;
      }
      return t.head;
    },
    length: function () {
      var t = this;
      var l = 0;
      while (!t.isEmpty) {
        l++;
        t = t.tail;
      }
      return l;
    },
    prepend: function (element) {
      return FP.List.Cons(element, this);
    },
    append: function (element) {
      var result = FP.List.Cons(element, FP.List.empty);
      this.reverse().foreach(function (e) {
        result = FP.List.Cons(e, result);
      });
      return result;
    },
    concat: function (that) {
      var result = that;
      this.reverse().foreach(function (e) {
        result = FP.List.Cons(e, result);
      });
      return result;
    },
    foldLeft: function (x0, f) {
      var r, c;
      r = f(x0, this.head);
      c = this.tail;
      while (!c.isEmpty) {
        r = f(r, c.head);
        c = c.tail;
      }
      return r;
    },
    foldRight: function (x0, f) {
      if (this.tail.isEmpty) {
        return f(this.head, x0);
      } else {
        return f(this.head, this.tail.foldRight(x0, f));
      }
    },
    map: function (f) {
      return FP.List.Cons(f(this.head), this.tail.map(f));
    },
    flatMap: function (k) {
      return k(this.head).concat(this.tail.flatMap(k));
    },
    foreach: function (f) {
      var e = this;
      while (!e.isEmpty) {
        f(e.head);
        e = e.tail;
      }
    },
    reverse: function () {
      var r = FP.List.empty;
      this.foreach(function (c) {
        r = FP.List.Cons(c, r);
      });
      return r;
    },
    mkString: function () {
      var open, delim, close;
      switch (arguments.length) {
        case 0:
          open = delim = close = "";
          break;
        case 1:
          delim = arguments[0];
          open = close = "";
          break;
        case 2:
          open = arguments[0];
          delim = arguments[1];
          close = "";
          break;
        default:
          open = arguments[0];
          delim = arguments[1];
          close = arguments[2];
          break;
      }
      var desc, nxt;
      desc = open + this.head.toString();
      nxt = this.tail;
      while (nxt.isa(FP.List.Cons)) {
        desc += delim + nxt.head.toString(); 
        nxt = nxt.tail;
      }
      desc += close;
      return desc;
    },
    toString: function () {
      return this.mkString("[", ", ", "]");
    }
  }, {
    unapply: function (x) { return FP.Option.Some([x.head, x.tail]); }
  });

  FP.List.Nil = FP.List.Subclass({
    isEmpty: true,
    at: function (index) {
      throw Error("cannot get element from an empty list.");
    },
    length: function () { return 0; },
    prepend: function (element) {
      return FP.List.Cons(element, FP.List.empty);
    },
    append: function (element) {
      return FP.List.Cons(element, FP.List.empty);
    },
    concat: function (that) {
      return that;
    },
    foldLeft: function (x0, f) { return x0; },
    foldRight: function (x0, f) { return x0; },
    flatMap: function (f) { return this; },
    map: function (f) { return this; },
    foreach: function (f) {},
    reverse: function () { return this; },
    mkString: function () {
      switch (arguments.length) {
        case 0:
        case 1:
          return "";
        case 2:
          return arguments[0]
        default:
          return arguments[0]+arguments[2];
      }
    },
    toString: function () { return '[]'; }
  }, {
    unapply: function (x) { return FP.Option.Some(x); }
  });

  FP.List.Augment({}, {
    empty: FP.List.Nil(),
    fromArray: function (as) {
      var list, i;
      list = FP.List.empty;
      i = as.length - 1;
      while (i >= 0) {
        list = FP.List.Cons(as[i], list);
        i -= 1;
      }
      return list;
    }
  });


  /************ MatchError **************/
  FP.MatchError = MathJax.Object.Subclass({
    Init: function (obj) { this.obj = obj; },
  //	getMessage: function () {
  //		if (this.obj === null) {
  //			return "null"
  //		} else {
  //			return obj.toString() + " (of class " + obj. + ")"
  //		}
  //	}
    toString: function () { return "MatchError(" + this.obj + ")"; }
  });


  /************ OffsetPosition **************/
  FP.OffsetPosition = MathJax.Object.Subclass({
    Init: function (source, offset) {
      // assert(source.length >= offset)
      this.source = source;
      if (offset === undefined) { this.offset = 0; } else { this.offset = offset; }	
      this._index = null;
      this._line = null;
    },
    index: function () {
      if (this._index !== null) { return this._index; }
      this._index = [];
      this._index.push(0);
      var i = 0;
      while (i < this.source.length) {
        if (this.source.charAt(i) === '\n') { this._index.push(i + 1); }
        i += 1;
      }
      this._index.push(this.source.length);
      return this._index;
    },
    line: function () {
      var lo, hi, mid;
      if (this._line !== null) { return this._line; }
      lo = 0;
      hi = this.index().length - 1;
      while (lo + 1 < hi) {
        mid = (hi + lo) >> 1;
        if (this.offset < this.index()[mid]) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      this._line = lo + 1;
      return this._line;
    },
    column: function () {
      return this.offset - this.index()[this.line() - 1] + 1;
    },
    lineContents: function () {
      var i, l;
      i = this.index();
      l = this.line();
      return this.source.substring(i[l - 1], i[l]);
    },
    toString: function () { return this.line().toString() + '.' + this.column(); },
    longString: function () {
      var desc, i;
      desc = this.lineContents() + '\n';
      i = 0;
      while (i < this.column()) {
        if (this.lineContents().charAt(i) === '\t') {
          desc += '\t';
        } else {
          desc += ' ';
        }
        i += 1;
      }
      desc += '^';
      return desc;
    },
    isLessThan: function (that) {
      if (that.isa(FP.OffsetPosition)) {
        return this.offset < that.offset;
      } else {
        return (
          this.line() < that.line() || 
          (this.line() === that.line() && this.column() < that.column())
        );
      }
    } 
  });


  /************ StringReader **************/
  FP.StringReader = MathJax.Object.Subclass({
    Init: function (source, offset, context) {
      this.source = source;
      this.offset = offset;
      this.context = context;
    },
    first: function () {
      if (this.offset < this.source.length) {
        return this.source.charAt(this.offset);
      } else {
        return FP.StringReader.EofCh;
      }
    },
    rest: function () {
      if (this.offset < this.source.length) {
        return FP.StringReader(this.source, this.offset + 1, this.context);
      } else {
        return this;
      }
    },
    pos: function () { return FP.OffsetPosition(this.source, this.offset); },
    atEnd: function () { return this.offset >= this.source.length; },
    drop: function (n) {
      var r, count;
      r = this;
      count = n;
      while (count > 0) {
        r = r.rest();
        count -= 1;
      }
      return r;
    }
  }, {
    EofCh: '\x03'
  });


  /************ Parsers **************/
  FP.Parsers = MathJax.Object.Subclass({}, {
    parse: function (p, input) {
      return p.apply(input);
    },
    parseAll: function (p, input) {
      return p.andl(function () { return FP.Parsers.eos(); }).apply(input);
    },
    parseString: function (p, str) {
      var input = FP.StringReader(str, 0, { lastNoSuccess: undefined });
      return FP.Parsers.parse(p, input);
    },
    parseAllString: function (p, str) {
      var input = FP.StringReader(str, 0, { lastNoSuccess: undefined });
      return FP.Parsers.parseAll(p, input);
    },
    _handleWhiteSpace: function (input) {
      var whiteSpaceRegex = input.context.whiteSpaceRegex;
      var source = input.source;
      var offset = input.offset;
      var m = whiteSpaceRegex.exec(source.substring(offset, source.length));
      if (m !== null) {
        return offset + m[0].length;
      } else {
        return offset;
      }
    },
    literal: function (str) {
      return FP.Parsers.Parser(function (input) {
        var source, offset, start, i, j, found;
        source = input.source;
        offset = input.offset;
        start = FP.Parsers._handleWhiteSpace(input);
        i = 0;
        j = start;
        while (i < str.length && j < source.length && 
            str.charAt(i) === source.charAt(j)) {
          i += 1;
          j += 1;
        }
        if (i === str.length) {
          return FP.Parsers.Success(str, input.drop(j - offset));
        } else {
          if (start === source.length) {
            found = "end of source";
          } else {
            found = "`" + source.charAt(start) + "'";
          }
          return FP.Parsers.Failure(
            "`" + str + "' expected but " + found + " found",
            input.drop(start - offset)
          );
        }
      });
    },
    regex: function (rx /* must start with ^ */) {
      if (rx.toString().substring(0, 2) !== "/^") {
        throw ("regex must start with `^' but " + rx);
      }
      return FP.Parsers.Parser(function (input) {
        var source, offset, m, found;
        source = input.source;
        offset = input.offset;
        m = rx.exec(source.substring(offset, source.length));
        if (m !== null) {
          return FP.Parsers.Success(m[0], input.drop(m[0].length));
        } else {
          if (offset === source.length) {
            found = "end of source";
          } else {
            found = "`" + source.charAt(offset) + "'";
          }
          return FP.Parsers.Failure(
            "string matching regex " + rx + " expected but " + found + " found",
            input
          );
        }
      });
    },
    regexLiteral: function (rx /* must start with ^ */) {
      if (rx.toString().substring(0, 2) !== "/^") {
        throw ("regex must start with `^' but " + rx);
      }
      return FP.Parsers.Parser(function (input) {
        var source, offset, start, m, found;
        source = input.source;
        offset = input.offset;
        start = FP.Parsers._handleWhiteSpace(input);
        m = rx.exec(source.substring(start, source.length));
        if (m !== null) {
          return FP.Parsers.Success(m[0], input.drop(start + m[0].length - offset));
        } else {
          if (start === source.length) {
            found = "end of source";
          } else {
            found = "`" + source.charAt(start) + "'";
          }
          return FP.Parsers.Failure(
            "string matching regex " + rx + " expected but " + found + " found",
            input.drop(start - offset)
          );
        }
      });
    },
    eos: function () {
      return FP.Parsers.Parser(function (input) {
        var source, offset, start;
        source = input.source;
        offset = input.offset;
        start = FP.Parsers._handleWhiteSpace(input);
        if (source.length === start) {
          return FP.Parsers.Success("", input);
        } else {
          return FP.Parsers.Failure("end of source expected but `" + 
            source.charAt(start) + "' found", input);
        }
      });
    },
    commit: function (/*lazy*/ p) {
      return FP.Parsers.Parser(function (input) {
        var res = p()(input);
        return (FP.Matcher()
          .Case(FP.Parsers.Success, function (x) { return res; })
          .Case(FP.Parsers.Error, function (x) { return res; })
          .Case(FP.Parsers.Failure, function (x) {
            return FP.Parsers.Error(x[0], x[1]);
          }).match(res)
        );
      });
    },
    //elem: function (kind, p)
    elem: function (e) { return FP.Parsers.accept(e).named('"' + e + '"'); },
    accept: function (e) {
      return FP.Parsers.acceptIf(
        function (x) { return x === e; },
        function (x) { return "`" + e + "' expected but `" + x + "' found"; }
      );
    },
    acceptIf: function (p, err) {
      return FP.Parsers.Parser(function (input) {
        if (p(input.first())) {
          return FP.Parsers.Success(input.first(), input.rest());
        } else {
          return FP.Parsers.Failure(err(input.first()), input);
        }
      });
    },
    //acceptMatch: function (expected, f)
    //acceptSeq: function (es)
    failure: function (msg) {
      return FP.Parsers.Parser(function (input) {
        return FP.Parsers.Failure(msg, input);
      });
    },
    err: function (msg) {
      return FP.Parsers.Parser(function (input) {
        return FP.Parsers.Error(msg, input);
      });
    },
    success: function (v) {
      return FP.Parsers.Parser(function (input) {
        return FP.Parsers.Success(v, input);
      });
    },
    log: function (/*lazy*/ p, name) {
      return FP.Parsers.Parser(function (input) {
        console.log("trying " + name + " at " + input);
        var r = p().apply(input);
        console.log(name + " --> " + r);
        return r;
      });
    },
    rep: function (/*lazy*/ p) {
      var s = FP.Parsers.success(FP.List.empty);
      return FP.Parsers.rep1(p).or(function () { return s; });
    },
    rep1: function (/*lazy*/ p) {
      return FP.Parsers.Parser(function (input) {
        var elems, i, p0, res;
        elems = [];
        i = input;
        p0 = p();
        res = p0.apply(input);
        if (res.isa(FP.Parsers.Success)) {
          while (res.isa(FP.Parsers.Success)) {
            elems.push(res.result);
            i = res.next;
            res = p0.apply(i);
          }
          return FP.Parsers.Success(FP.List.fromArray(elems), i);
        } else {
          return res;
        }
      });
    },
    //rep1: function (/*lazy*/ first, /*lazy*/ p)
    repN: function (num, /*lazy*/ p) {
      if (num === 0) {
        return FP.Parsers.success(FP.List.empty);
      }
      return FP.Parsers.Parser(function (input) {
        var elems, i, p0, res;
        elems = [];
        i = input;
        p0 = p();
        res = p0.apply(i);
        while (res.isa(FP.Parsers.Success)) {
          elems.push(res.result);
          i = res.next;
          if (num === elems.length) {
            return FP.Parsers.Success(FP.List.fromArray(elems), i);
          }
          res = p0.apply(i);
        }
        return res; // NoSuccess
      });
    },
    repsep: function (/*lazy*/ p, /*lazy*/ q) {
      var s = FP.Parsers.success(FP.List.empty);
      return FP.Parsers.rep1sep(p, q).or(function () { return s; });
    },
    rep1sep: function (/*lazy*/ p, /*lazy*/ q) {
      return p().and(FP.Parsers.rep(q().andr(p))).to(function (res) {
        return FP.List.Cons(res.head, res.tail);
      });
    },
  //	chainl1: function (/*lazy*/ p, /*lazy*/ q) {
  //		return this.chainl1(p, p, q)
  //	},
    chainl1: function (/*lazy*/ first, /*lazy*/ p, /*lazy*/ q) {
      return first().and(FP.Parsers.rep(q().and(p))).to(function (res) {
        return res.tail.foldLeft(res.head, function (a, fb) { return fb.head(a, fb.tail); });
      });
    },
    chainr1: function (/*lazy*/ p, /*lazy*/ q, combine, first) {
      return p().and(this.rep(q().and(p))).to(function (res) {
        return FP.List.Cons(FP.Parsers.Pair(combine, res.head),
          res.tail).foldRight(first, function (fa, b) { return fa.head(fa.tail, b); }
          );
      });
    },
    opt: function (/*lazy*/ p) {
      return p().to(function (x) {
        return FP.Option.Some(x);
      }).or(function () {
        return FP.Parsers.success(FP.Option.empty);
      });
    },
    not: function (/*lazy*/ p) {
      return FP.Parsers.Parser(function (input) {
        var r = p().apply(input);
        if (r.successful) {
          return FP.Parsers.Failure("Expected failure", input);
        } else {
          return FP.Parsers.Success(FP.Option.empty, input);
        }
      });
    },
    guard: function (/*lazy*/ p) {
      return FP.Parsers.Parser(function (input) {
        var r = p().apply(input);
        if (r.successful) {
          return FP.Parsers.Success(r.result, input);
        } else {
          return r;
        }
      });
    },
    //positioned: function (/*lazy*/ p)
    //phrase: function (p)
    mkList: function (pair) { return FP.List.Cons(pair.head, pair.tail); },
    fun: function (x) { return function () { return x; }; },
    lazyParser: function (x) {
      var lit, r;
      if (x instanceof String || (typeof x) === "string") {
        lit = FP.Parsers.literal(x);
        return function () { return lit; };
      } else if (x instanceof Function) {
        // x is deemed to be a function which has the return value as Parser. 
        return x;
      } else if (x instanceof Object) {
        if("isa" in x && x.isa(FP.Parsers.Parser)) {
          return function () { return x; };
        } else if (x instanceof RegExp) {
          r = FP.Parsers.regexLiteral(x);
          return function () { return r; };
        } else {
          return FP.Parsers.err("unhandlable type");
        }
      } else {
        return FP.Parsers.err("unhandlable type");
      }
    },
    seq: function () {
      var count, parser, i;
      count = arguments.length;
      if (count === 0) { return FP.Parsers.err("at least one element must be specified"); }
      parser = FP.Parsers.lazyParser(arguments[0])();
      i = 1;
      while (i < count) {
        parser = parser.and(FP.Parsers.lazyParser(arguments[i]));
        i += 1;
      }
      return parser;
    },
    or: function () {
      var count, parser, i;
      count = arguments.length;
      if (count === 0) { return FP.Parsers.err("at least one element must be specified"); }
      parser = FP.Parsers.lazyParser(arguments[0])();
      i = 1;
      while (i < count) {
        parser = parser.or(FP.Parsers.lazyParser(arguments[i]));
        i += 1;
      }
      return parser;
    }
  });


  /************ Pair **************/
  FP.Parsers.Pair = MathJax.Object.Subclass({
    Init: function (head, tail) {
      this.head = head;
      this.tail = tail;
    },
    toString: function () { return '(' + this.head + '~' + this.tail + ')'; }
  }, {
    unapply: function (x) { return FP.Option.Some([x.head, x.tail]); }
  });


  /************ ParseResult **************/
  FP.Parsers.ParseResult = MathJax.Object.Subclass({
    Init: function () {},
    isEmpty: function () { return !this.successful; },
    getOrElse: function (/*lazy*/ defaultValue) {
      if (this.isEmpty) { return defaultValue(); } else { return this.get(); }
    } 
  });


  /************ Success **************/
  FP.Parsers.Success = FP.Parsers.ParseResult.Subclass({
    Init: function (result, next) {
      this.result = result;
      this.next = next;
    },
    map: function (f) { return FP.Parsers.Success(f(this.result), this.next); },
    mapPartial: function (f, err) {
      try {
        return FP.Parsers.Success(f(this.result), this.next);
      } catch (e) {
        if ("isa" in e && e.isa(FP.MatchError)) {
          return FP.Parsers.Failure(err(this.result), this.next);
        } else {
          throw e;
        }
      }
    },
    flatMapWithNext: function (f) { return f(this.result).apply(this.next); },
    append: function (/*lazy*/ a) { return this; },
    get: function () { return this.result; },
    successful: true,
    toString: function () { return '[' + this.next.pos() + '] parsed: ' + this.result; }
  }, {
    unapply: function (x) { return FP.Option.Some([x.result, x.next]); }
  });


  /************ NoSuccess **************/
  FP.Parsers.NoSuccess = FP.Parsers.ParseResult.Subclass({
    Init: function () {},
    _setLastNoSuccess: function () {
      var context = this.next.context;
      if (context.lastNoSuccess === undefined || !this.next.pos().isLessThan(context.lastNoSuccess.next.pos())) {
        context.lastNoSuccess = this;
      }
    },
    map: function (f) { return this; },
    mapPartial: function (f, error) { return this; },
    flatMapWithNext: function (f) { return this; },
    get: function () { return FP.Parsers.error("No result when parsing failed"); },
    successful: false
  });


  /************ Failure **************/
  FP.Parsers.Failure = FP.Parsers.NoSuccess.Subclass({
    Init: function (msg, next) {
      this.msg = msg;
      this.next = next;
      this._setLastNoSuccess();
    },
    append: function (/*lazy*/ a) {
      var alt = a();
      if (alt.isa(FP.Parsers.Success)) {
        return alt;
      } else if (alt.isa(FP.Parsers.NoSuccess)) {
        if (alt.next.pos().isLessThan(this.next.pos())) {
          return this;
        } else {
          return alt;
        }
      } else {
        throw FP.MatchError(alt);
      }
    },
    toString: function () { return ('[' + this.next.pos() + '] failure: ' + 
      this.msg + '\n\n' + this.next.pos().longString()); }
  }, {
    unapply: function (x) { return FP.Option.Some([x.msg, x.next]); }
  });


  /************ Error **************/
  FP.Parsers.Error = FP.Parsers.NoSuccess.Subclass({
    Init: function (msg, next) {
      this.msg = msg;
      this.next = next;
      this._setLastNoSuccess();
    },
    append: function (/*lazy*/ a) { return this; },
    toString: function () { return ('[' + this.next.pos() + '] error: ' + 
      this.msg + '\n\n' + this.next.pos().longString()); }
  }, {
    unapply: function (x) { return FP.Option.Some([x.msg, x.next]); }
  });


  /************ Parser **************/
  FP.Parsers.Parser = MathJax.Object.Subclass({
    Init: function (f) { this.apply = f; },
    name: '',
    named: function (name) { this.name = name; return this; },
    toString: function () { return 'Parser (' + this.name + ')'; },
    flatMap: function (f) {
      var app = this.apply;
      return FP.Parsers.Parser(function (input) {
        return app(input).flatMapWithNext(f);
      });
    },
    map: function (f) {
      var app = this.apply;
      return FP.Parsers.Parser(function (input) {
        return app(input).map(f);
      });
    },
    append: function (/*lazy*/ p) {
      var app = this.apply;
      return FP.Parsers.Parser(function (input) {
        return app(input).append(function () {
          return p().apply(input);
        });
      });
    },
    and: function (/*lazy*/ p) {
      return this.flatMap(function (a) {
        return p().map(function (b) {
          return FP.Parsers.Pair(a, b);
        });
      }).named('~');
    },
    andr: function (/*lazy*/ p) {
      return this.flatMap(function (a) {
        return p().map(function (b) {
          return b;
        });
      }).named('~>');
    },
    andl: function (/*lazy*/ p) {
      return this.flatMap(function (a) {
        return p().map(function (b) {
          return a;
        });
      }).named('<~');
    },
    or: function (/*lazy*/ q) { return this.append(q).named("|"); },
    andOnce: function (/*lazy*/ p) {
      var flatMap = this.flatMap;
      return FP.Parsers.OnceParser(function () {
        return flatMap(function (a) {
          return FP.Parsers.commit(p).map(function (b) {
            return FP.Parsers.Pair(a, b);
          });
        }).named('~!');
      });
    },
    longestOr: function (/*lazy*/ q0) {
      var app = this.apply;
      return FP.Parsers.Parser(function (input) {
        var res1, res2;
        res1 = app(input);
        res2 = q0()(input);
        if (res1.successful) {
          if (res2.successful) {
            if (res2.next.pos().isLessThan(res1.next.pos())) {
              return res1;
            } else {
              return res2;
            }
          } else {
            return res1;
          }
        } else if (res2.successful) {
          return res2;
        } else if (res1.isa(FP.Parsers.Error)) {
          return res1;
        } else {
          if (res2.next.pos().isLessThan(res1.next.pos())) {
            return res1;
          } else {
            return res2;
          }
        }
      }).named("|||");
    },
    to: function (f) { return this.map(f).named(this.toString() + '^^'); },
    ret: function (/*lazy*/ v) {
      var app = this.apply;
      return FP.Parsers.Parser(function (input) {
        return app(input).map(function (x) { return v(); });
      }).named(this.toString() + "^^^");
    },
    toIfPossible: function (f, error) {
      if (error === undefined) {
        error = function (r) { return "Constructor function not defined at " + r; };
      }
      var app = this.apply;
      return FP.Parsers.Parser(function (input) {
        return app(input).mapPartial(f, error);
      }).named(this.toString() + "^?");
    },
    into: function (fq) { return this.flatMap(fq); },
    rep: function () {
      var p = this;
      return FP.Parsers.rep(function () { return p; });
    },
    chain: function (/*lazy*/ sep) {
      var p, lp;
      p = this;
      lp = function () { return p; };
      return FP.Parsers.chainl1(lp, lp, sep);
    },
    rep1: function () {
      var p = this;
      return FP.Parsers.rep1(function () { return p; });
    },
    opt: function () {
      var p = this;
      return FP.Parsers.opt(function () { return p; });
    }
  });


  /************ OnceParser **************/
  FP.Parsers.OnceParser = FP.Parsers.Parser.Subclass({
    Init: function (f) { this.apply = f; },
    and: function (p) {
      var flatMap = this.flatMap;
      return FP.Parsers.OnceParser(function () {
        return flatMap(function (a) {
          return FP.Parsers.commit(p).map(function (b) {
            return FP.Parsers.Pair(a, b);
          });
        });
      }).named('~');
    }
  });
  
  MathJax.Hub.Startup.signal.Post("Functional Programming library Ready");
});

MathJax.Ajax.loadComplete("[MathJax]/extensions/fp.js");