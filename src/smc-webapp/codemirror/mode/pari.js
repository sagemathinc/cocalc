/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

(function (mod) {
  if (typeof exports == "object" && typeof module == "object")
    // CommonJS
    mod(require("codemirror"));
  else if (typeof define == "function" && define.amd)
    // AMD
    define(["codemirror"], mod);
  // Plain browser env
  else mod(CodeMirror);
})(function (CodeMirror) {
  CodeMirror.defineMode("pari", function (config, parserConfig) {
    var indentUnit = config.indentUnit,
      statementIndentUnit = parserConfig.statementIndentUnit || indentUnit,
      dontAlignCalls = parserConfig.dontAlignCalls,
      keywords = parserConfig.keywords || {},
      builtin = parserConfig.builtin || {},
      blockKeywords = parserConfig.blockKeywords || {},
      atoms = parserConfig.atoms || {},
      hooks = parserConfig.hooks || {},
      multiLineStrings = parserConfig.multiLineStrings;
    var isOperatorChar = /[+\-*&%=<>!?|\/]/;

    var curPunc;

    function tokenBase(stream, state) {
      var ch = stream.next();
      if (hooks[ch]) {
        var result = hooks[ch](stream, state);
        if (result !== false) return result;
      }
      if (ch == '"' || ch == "'") {
        state.tokenize = tokenString(ch);
        return state.tokenize(stream, state);
      }
      if (/[\[\]{}\(\),;\:\.]/.test(ch)) {
        curPunc = ch;
        return null;
      }
      if (/\d/.test(ch)) {
        stream.eatWhile(/[\w\.]/);
        return "number";
      }
      if (ch == "/") {
        if (stream.eat("*")) {
          state.tokenize = tokenComment;
          return tokenComment(stream, state);
        }
        if (stream.eat("/")) {
          stream.skipToEnd();
          return "comment";
        }
      }
      if (ch == "\\") {
        if (stream.eat("\\")) {
          stream.skipToEnd();
          return "comment";
        }
      }
      if (isOperatorChar.test(ch)) {
        stream.eatWhile(isOperatorChar);
        return "operator";
      }
      stream.eatWhile(/[\w\$_]/);
      var cur = stream.current();
      if (keywords.propertyIsEnumerable(cur)) {
        if (blockKeywords.propertyIsEnumerable(cur)) curPunc = "newstatement";
        return "keyword";
      }
      if (builtin.propertyIsEnumerable(cur)) {
        if (blockKeywords.propertyIsEnumerable(cur)) curPunc = "newstatement";
        return "builtin";
      }
      if (atoms.propertyIsEnumerable(cur)) return "atom";
      return "variable";
    }

    function tokenString(quote) {
      return function (stream, state) {
        var escaped = false,
          next,
          end = false;
        while ((next = stream.next()) != null) {
          if (next == quote && !escaped) {
            end = true;
            break;
          }
          escaped = !escaped && next == "\\";
        }
        if (end || !(escaped || multiLineStrings)) state.tokenize = null;
        return "string";
      };
    }

    function tokenComment(stream, state) {
      var maybeEnd = false,
        ch;
      while ((ch = stream.next())) {
        if (ch == "/" && maybeEnd) {
          state.tokenize = null;
          break;
        }
        maybeEnd = ch == "*";
      }
      return "comment";
    }

    function Context(indented, column, type, align, prev) {
      this.indented = indented;
      this.column = column;
      this.type = type;
      this.align = align;
      this.prev = prev;
    }
    function pushContext(state, col, type) {
      var indent = state.indented;
      if (state.context && state.context.type == "statement")
        indent = state.context.indented;
      return (state.context = new Context(
        indent,
        col,
        type,
        null,
        state.context
      ));
    }
    function popContext(state) {
      var t = state.context.type;
      if (t == ")" || t == "]" || t == "}")
        state.indented = state.context.indented;
      return (state.context = state.context.prev);
    }

    // Interface

    return {
      startState: function (basecolumn) {
        return {
          tokenize: null,
          context: new Context((basecolumn || 0) - indentUnit, 0, "top", false),
          indented: 0,
          startOfLine: true,
        };
      },

      token: function (stream, state) {
        var ctx = state.context;
        if (stream.sol()) {
          if (ctx.align == null) ctx.align = false;
          state.indented = stream.indentation();
          state.startOfLine = true;
        }
        if (stream.eatSpace()) return null;
        curPunc = null;
        var style = (state.tokenize || tokenBase)(stream, state);
        if (style == "comment" || style == "meta") return style;
        if (ctx.align == null) ctx.align = true;

        if (
          (curPunc == ";" || curPunc == ":" || curPunc == ",") &&
          ctx.type == "statement"
        )
          popContext(state);
        else if (curPunc == "{") pushContext(state, stream.column(), "}");
        else if (curPunc == "[") pushContext(state, stream.column(), "]");
        else if (curPunc == "(") pushContext(state, stream.column(), ")");
        else if (curPunc == "}") {
          while (ctx.type == "statement") ctx = popContext(state);
          if (ctx.type == "}") ctx = popContext(state);
          while (ctx.type == "statement") ctx = popContext(state);
        } else if (curPunc == ctx.type) popContext(state);
        else if (
          ((ctx.type == "}" || ctx.type == "top") && curPunc != ";") ||
          (ctx.type == "statement" && curPunc == "newstatement")
        )
          pushContext(state, stream.column(), "statement");
        state.startOfLine = false;
        return style;
      },

      indent: function (state, textAfter) {
        if (state.tokenize != tokenBase && state.tokenize != null)
          return CodeMirror.Pass;
        var ctx = state.context,
          firstChar = textAfter && textAfter.charAt(0);
        if (ctx.type == "statement" && firstChar == "}") ctx = ctx.prev;
        var closing = firstChar == ctx.type;
        if (ctx.type == "statement")
          return ctx.indented + (firstChar == "{" ? 0 : statementIndentUnit);
        else if (ctx.align && (!dontAlignCalls || ctx.type != ")"))
          return ctx.column + (closing ? 0 : 1);
        else if (ctx.type == ")" && !closing)
          return ctx.indented + statementIndentUnit;
        else return ctx.indented + (closing ? 0 : indentUnit);
      },

      electricChars: "{}",
      blockCommentStart: "/*",
      blockCommentEnd: "*/",
      lineComment: "\\\\",
      fold: "brace",
    };
  });

  (function () {
    function words(str) {
      var obj = {},
        words = str.split(" ");
      for (var i = 0; i < words.length; ++i) obj[words[i]] = true;
      return obj;
    }
    var cKeywords =
      "Col Euler I List Mat Mod O Pi Pol Polrev Qfb Ser Set Str Strchr Strexpand Strprintf Strtex Vec Vecrev Vecsmall abs acos acosh addhelp addprimes agm alarm algdep alias allocatemem apply arg asin asinh atan atanh bernfrac bernreal bernvec besselh1 besselh2 besseli besselj besseljh besselk besseln bestappr bezout bezoutres bigomega binary binomial bitand bitneg bitnegimply bitor bittest bitxor bnfcertify bnfcompress bnfdecodemodule bnfinit bnfisintnorm bnfisnorm bnfisprincipal bnfissunit bnfisunit bnfnarrow bnfsignunit bnfsunit bnrL1 bnrclassno bnrclassnolist bnrconductor bnrconductorofchar bnrdisc bnrdisclist bnrinit bnrisconductor bnrisprincipal bnrrootnumber bnrstark break ceil centerlift charpoly chinese component concat conj conjvec content contfrac contfracpnqn core coredisc cos cosh cotan default denominator deriv derivnum diffop dilog dirdiv direuler dirmul dirzetak divisors divrem eint1 ellL1 elladd ellak ellan ellanalyticrank ellap ellbil ellchangecurve ellchangepoint ellconvertname elldivpol elleisnum elleta ellgenerators ellglobalred ellgroup ellheight ellheightmatrix ellidentify ellinit ellisoncurve ellj elllocalred elllog elllseries ellminimalmodel ellmodulareqn ellorder ellordinate ellpointtoz ellpow ellrootno ellsearch ellsigma ellsub elltaniyama elltatepairing elltors ellweilpairing ellwp ellzeta ellztopoint erfc error eta eulerphi eval exp extern externstr factor factorback factorcantor factorff factorial factorint factormod factornf factorpadic ffgen ffinit fflog fforder ffprimroot fibonacci floor for fordiv forell forprime forstep forsubgroup forvec frac galoisexport galoisfixedfield galoisgetpol galoisidentify galoisinit galoisisabelian galoisisnormal galoispermtopol galoissubcyclo galoissubfields galoissubgroups gamma gammah gcd getheap getrand getstack gettime global hilbert hyperu idealadd idealaddtoone idealappr idealchinese idealcoprime idealdiv idealfactor idealfactorback idealfrobenius idealhnf idealintersect idealinv ideallist ideallistarch ideallog idealmin idealmul idealnorm idealpow idealprimedec idealramgroups idealred idealstar idealtwoelt idealval if imag incgam incgamc input install intcirc intformal intfouriercos intfourierexp intfouriersin intfuncinit intlaplaceinv intmellininv intmellininvshort intnum intnuminit intnuminitgen intnumromb intnumstep isfundamental ispower isprime ispseudoprime issquare issquarefree kill kronecker lcm length lex lift lindep listcreate listinsert listkill listpop listput listsort lngamma local log matadjoint matalgtobasis matbasistoalg matcompanion matdet matdetint matdiagonal mateigen matfrobenius mathess mathilbert mathnf mathnfmod mathnfmodid matid matimage matimagecompl matindexrank matintersect matinverseimage matisdiagonal matker matkerint matmuldiagonal matmultodiagonal matpascal matrank matrix matrixqz matsize matsnf matsolve matsolvemod matsupplement mattranspose max min minpoly modreverse moebius my newtonpoly next nextprime nfalgtobasis nfbasis nfbasistoalg nfdetint nfdisc nfeltadd nfeltdiv nfeltdiveuc nfeltdivmodpr nfeltdivrem nfeltmod nfeltmul nfeltmulmodpr nfeltnorm nfeltpow nfeltpowmodpr nfeltreduce nfeltreducemodpr nfelttrace nfeltval nffactor nffactorback nffactormod nfgaloisapply nfgaloisconj nfhilbert nfhnf nfhnfmod nfinit nfisideal nfisincl nfisisom nfkermodpr nfmodprinit nfnewprec nfroots nfrootsof1 nfsnf nfsolvemodpr nfsubfields norm norml2 numbpart numdiv numerator numtoperm omega padicappr padicfields padicprec partitions permtonum plot plotbox plotclip plotcolor plotcopy plotcursor plotdraw ploth plothraw plothsizes plotinit plotkill plotlines plotlinetype plotmove plotpoints plotpointsize plotpointtype plotrbox plotrecth plotrecthraw plotrline plotrmove plotrpoint plotscale plotstring polchebyshev polcoeff polcompositum polcyclo poldegree poldisc poldiscreduced polgalois polhensellift polhermite polinterpolate polisirreducible pollead pollegendre polrecip polred polredabs polredbest polredord polresultant polroots polrootsff polrootsmod polrootspadic polsturm polsubcyclo polsylvestermatrix polsym poltchebi poltschirnhaus polylog polzagier precision precprime prime primepi primes print print1 printf printtex prod prodeuler prodinf psdraw psi psploth psplothraw qfbclassno qfbcompraw qfbhclassno qfbnucomp qfbnupow qfbpowraw qfbprimeform qfbred qfbsolve qfgaussred qfjacobi qflll qflllgram qfminim qfperfection qfrep qfsign quadclassunit quaddisc quadgen quadhilbert quadpoly quadray quadregulator quadunit quit random read readvec real removeprimes return rnfalgtobasis rnfbasis rnfbasistoalg rnfcharpoly rnfconductor rnfdedekind rnfdet rnfdisc rnfeltabstorel rnfeltdown rnfeltreltoabs rnfeltup rnfequation rnfhnfbasis rnfidealabstorel rnfidealdown rnfidealhnf rnfidealmul rnfidealnormabs rnfidealnormrel rnfidealreltoabs rnfidealtwoelt rnfidealup rnfinit rnfisabelian rnfisfree rnfisnorm rnfisnorminit rnfkummer rnflllgram rnfnormgroup rnfpolred rnfpolredabs rnfpseudobasis rnfsteinitz round select serconvol serlaplace serreverse setintersect setisset setminus setrand setsearch setunion shift shiftmul sigma sign simplify sin sinh sizebyte sizedigit solve sqr sqrt sqrtint sqrtn stirling subgrouplist subst substpol substvec sum sumalt sumdedekind sumdiv suminf sumnum sumnumalt sumnuminit sumpos system tan tanh taylor teichmuller theta thetanullk thue thueinit trace trap truncate type until valuation variable vecextract vecmax vecmin vecsort vector vectorsmall vectorv version warning weber whatnow while write write1 writebin writetex zeta zetak zetakinit zncoppersmith znlog znorder znprimroot znstar";

    function cppHook(stream, state) {
      if (!state.startOfLine) return false;
      for (;;) {
        if (stream.skipTo("\\")) {
          stream.next();
          if (stream.eol()) {
            state.tokenize = cppHook;
            break;
          }
        } else {
          stream.skipToEnd();
          state.tokenize = null;
          break;
        }
      }
      return "meta";
    }

    // C#-style strings where "" escapes a quote.
    function tokenAtString(stream, state) {
      var next;
      while ((next = stream.next()) != null) {
        if (next == '"' && !stream.eat('"')) {
          state.tokenize = null;
          break;
        }
      }
      return "string";
    }

    function mimes(ms, mode) {
      for (var i = 0; i < ms.length; ++i) CodeMirror.defineMIME(ms[i], mode);
    }

    mimes(["text/pari"], {
      name: "pari",
      keywords: words(cKeywords),
      blockKeywords: words(
        "catch class do else finally for if struct switch try while"
      ),
      atoms: words("true false null"),
      hooks: { "#": cppHook },
    });
  })();
});
