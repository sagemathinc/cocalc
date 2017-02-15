###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014 -- 2016, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

##########################################################################
#
# Misc. functions that are needed elsewhere.
#
##########################################################################
#
###############################################################################
# Copyright (C) 2016, Sagemath Inc.
# All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
#
# 1. Redistributions of source code must retain the above copyright notice, this
#    list of conditions and the following disclaimer.
# 2. Redistributions in binary form must reproduce the above copyright notice,
#    this list of conditions and the following disclaimer in the documentation
#    and/or other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
# ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
# (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
# LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
# ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
# (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
# SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
###############################################################################

_ = underscore = require('underscore')

if process?.env?.DEVEL and not process?.env?.SMC_TEST
    # Running on node and DEVEL is set and not running under test suite
    DEBUG = true
else
    DEBUG = false

# console.debug only logs if DEBUG is true
if DEBUG
    console.debug = console.log
else
    console.debug = ->

if process?.env?.SMC_TEST
    # in test mode we *do* want exception to get thrown below when type checks fails
    TEST_MODE = true

exports.RUNNING_IN_NODE = process?.title == 'node'

# startswith(s, x) is true if s starts with the string x or any of the strings in x.
exports.startswith = (s, x) ->
    if typeof(x) == "string"
        return s.indexOf(x) == 0
    else
        for v in x
            if s.indexOf(v) == 0
                return true
        return false

exports.endswith = (s, t) ->
    return s.slice(s.length - t.length) == t

# modifies in place the object dest so that it includes all values in objs and returns dest
exports.merge = (dest, objs...) ->
    for obj in objs
        dest[k] = v for k, v of obj
    dest

# Return a random element of an array
exports.random_choice = (array) -> array[Math.floor(Math.random() * array.length)]

# Given an object map {foo:bar, ...} returns an array [foo, bar] randomly
# chosen from the object map.
exports.random_choice_from_obj = (obj) ->
    k = exports.random_choice(exports.keys(obj))
    return [k, obj[k]]

# Returns a random integer in the range, inclusive (like in Python)
exports.randint = (lower, upper) ->
    if lower > upper
        throw new Error("randint: lower is larger than upper")
    Math.floor(Math.random()*(upper - lower + 1)) + lower

# Like Python's string split -- splits on whitespace
exports.split = (s) ->
    r = s.match(/\S+/g)
    if r
        return r
    else
        return []

# Like the exports.split method, but quoted terms are grouped together for an exact search.
exports.search_split = (search) ->
    terms = []
    search = search.split('"')
    length = search.length
    for element, i in search
        element = element.trim()
        if element.length != 0
            # the even elements lack quotation
            # if there are an even number of elements that means there is an unclosed quote,
            # so the last element shouldn't be grouped.
            if i % 2 == 0 or (i == length - 1 and length % 2 == 0)
                terms.push(element.split(" ")...)
            else
                terms.push(element)
    return terms

# s = lower case string
# v = array of terms as output by search_split above
exports.search_match = (s, v) ->
    for x in v
        if s.indexOf(x) == -1
            return false
    return true

# return true if the word contains the substring
exports.contains = (word, sub) ->
    return word.indexOf(sub) isnt -1


# Count number of occurrences of m in s-- see http://stackoverflow.com/questions/881085/count-the-number-of-occurences-of-a-character-in-a-string-in-javascript

exports.count = (str, strsearch) ->
    index = -1
    count = -1
    loop
        index = str.indexOf(strsearch, index + 1)
        count++
        break if index is -1
    return count

# modifies target in place, so that the properties of target are the
# same as those of upper_bound, and each is <=.
exports.min_object = (target, upper_bounds) ->
    if not target?
        target = {}
    for prop, val of upper_bounds
        target[prop] = if target.hasOwnProperty(prop) then target[prop] = Math.min(target[prop], upper_bounds[prop]) else upper_bounds[prop]

# Returns a new object with properties determined by those of obj1 and
# obj2.  The properties in obj1 *must* all also appear in obj2.  If an
# obj2 property has value "defaults.required", then it must appear in
# obj1.  For each property P of obj2 not specified in obj1, the
# corresponding value obj1[P] is set (all in a new copy of obj1) to
# be obj2[P].
defaults = exports.defaults = (obj1, obj2, allow_extra) ->
    if not obj1?
        obj1 = {}
    error  = () ->
        try
            s = "(obj1=#{exports.trunc(exports.to_json(obj1),1024)}, obj2=#{exports.trunc(exports.to_json(obj2),1024)})"
            if not TEST_MODE
                console.log(s)
            return s
        catch err
            return ""
    if not obj1?
        # useful special case
        obj1 = {}
    if typeof(obj1) != 'object'
        # We put explicit traces before the errors in this function,
        # since otherwise they can be very hard to debug.
        err = "BUG -- Traceback -- misc.defaults -- TypeError: function takes inputs as an object #{error()}"
        console.log(err)
        console.trace()
        if DEBUG or TEST_MODE
            throw new Error(err)
        else
            return obj2
    r = {}
    for prop, val of obj2
        if obj1.hasOwnProperty(prop) and obj1[prop]?
            if obj2[prop] == exports.defaults.required and not obj1[prop]?
                err = "misc.defaults -- TypeError: property '#{prop}' must be specified: #{error()}"
                console.debug(err)
                console.trace()
                if DEBUG or TEST_MODE
                    throw new Error(err)
            r[prop] = obj1[prop]
        else if obj2[prop]?  # only record not undefined properties
            if obj2[prop] == exports.defaults.required
                err = "misc.defaults -- TypeError: property '#{prop}' must be specified: #{error()}"
                console.debug(err)
                console.trace()
                if DEBUG or TEST_MODE
                    throw new Error(err)
            else
                r[prop] = obj2[prop]
    if not allow_extra
        for prop, val of obj1
            if not obj2.hasOwnProperty(prop)
                err = "misc.defaults -- TypeError: got an unexpected argument '#{prop}' #{error()}"
                console.debug(err)
                console.trace()
                if DEBUG or TEST_MODE
                    throw new Error(err)
    return r

# WARNING -- don't accidentally use this as a default:
required = exports.required = exports.defaults.required = "__!!!!!!this is a required property!!!!!!__"

# Current time in milliseconds since epoch
exports.mswalltime = (t) ->
    if t?
        return (new Date()).getTime() - t
    else
        return (new Date()).getTime()

# Current time in seconds since epoch, as a floating point number (so much more precise than just seconds).
exports.walltime = (t) ->
    if t?
        return exports.mswalltime()/1000.0 - t
    else
        return exports.mswalltime()/1000.0

# We use this uuid implementation only for the browser client.  For node code, use node-uuid.
exports.uuid = ->
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace /[xy]/g, (c) ->
        r = Math.random() * 16 | 0
        v = if c == 'x' then r else r & 0x3 | 0x8
        v.toString 16

exports.is_valid_uuid_string = (uuid) ->
    return typeof(uuid) == "string" and uuid.length == 36 and /[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/i.test(uuid)
    # /[0-9a-f]{22}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(uuid)

exports.is_valid_sha1_string = (s) ->
    return typeof(s) == 'string' and s.length == 40 and /[a-fA-F0-9]{40}/i.test(s)

# Compute a uuid v4 from the Sha-1 hash of data.
# If on backend, use the version in misc_node, which is faster.
sha1 = require('sha1')
exports.uuidsha1 = (data) ->
    s = sha1(data)
    i = -1
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) ->
        i += 1
        switch c
            when 'x'
                return s[i]
            when 'y'
                # take 8 + low order 3 bits of hex number.
                return ((parseInt('0x'+s[i],16)&0x3)|0x8).toString(16)
    )

zipcode = new RegExp("^\\d{5}(-\\d{4})?$")
exports.is_valid_zipcode = (zip) -> zipcode.test(zip)

# Return a very rough benchmark of the number of times f will run per second.
exports.times_per_second = (f, max_time=5, max_loops=1000) ->
    # return number of times per second that f() can be called
    t = exports.walltime()
    i = 0
    tm = 0
    while true
        f()
        tm = exports.walltime() - t
        i += 1
        if tm >= max_time or i >= max_loops
            break
    return Math.ceil(i/tm)

exports.to_json = (x) ->
    JSON.stringify(x)

# convert object x to a JSON string, removing any keys that have "pass" in them and
# any values that are potentially big -- this is meant to only be used for loging.
exports.to_safe_str = (x) ->
    obj = {}
    for key, value of x
        sanitize = false

        if key.indexOf("pass") != -1
            sanitize = true
        else if typeof(value)=='string' and value.slice(0,7) == "sha512$"
            sanitize = true

        if sanitize
            obj[key] = '(unsafe)'
        else
            if typeof(value) == "object"
                value = "[object]"  # many objects, e.g., buffers can block for seconds to JSON...
            else if typeof(value) == "string"
                value = exports.trunc(value,250) # long strings are not SAFE -- since JSON'ing them for logging blocks for seconds!
            obj[key] = value

    x = exports.to_json(obj)

# convert from a JSON string to Javascript (properly dealing with ISO dates)
#   e.g.,   2016-12-12T02:12:03.239Z    and    2016-12-12T02:02:53.358752
reISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/
date_parser = (k, v) ->
    if typeof(v) == 'string' and v.length >= 20 and reISO.exec(v)
        return new Date(v)
    else
        return v

exports.from_json = (x) ->
    try
        JSON.parse(x, date_parser)
    catch err
        console.debug("from_json: error parsing #{x} (=#{exports.to_json(x)}) from JSON")
        throw err

# Returns modified version of obj with any string
# that look like ISO dates to actual Date objects.  This mutates
# obj in place as part of the process.
exports.fix_json_dates = fix_json_dates = (obj) ->
    if exports.is_object(obj)
        for k, v of obj
            if typeof(v) == 'object'
                fix_json_dates(v)
            else if typeof(v) == 'string' and v.length >= 20 and reISO.exec(v)
                obj[k] = new Date(v)
    else if exports.is_array(obj)
        for i, x of obj
            obj[i] = fix_json_dates(x)
    else if typeof(obj) == 'string' and obj.length >= 20 and reISO.exec(obj)
        return new Date(obj)
    return obj

# converts a Date object to an ISO string in UTC.
# NOTE -- we remove the +0000 (or whatever) timezone offset, since *all* machines within
# the SMC servers are assumed to be on UTC.
exports.to_iso = (d) -> (new Date(d - d.getTimezoneOffset()*60*1000)).toISOString().slice(0,-5)

# turns a Date object into a more human readable more friendly directory name in the local timezone
exports.to_iso_path = (d) -> exports.to_iso(d).replace('T','-').replace(/:/g,'')

# returns true if the given object has no keys
exports.is_empty_object = (obj) -> Object.keys(obj).length == 0

# returns the number of keys of an object, e.g., {a:5, b:7, d:'hello'} --> 3
exports.len = (obj) ->
    if not obj?
        return 0
    a = obj.length
    if a?
        return a
    Object.keys(obj).length

# return the keys of an object, e.g., {a:5, xyz:'10'} -> ['a', 'xyz']
exports.keys = underscore.keys

# returns the values of a map
exports.values = underscore.values

# as in python, makes a map from an array of pairs [(x,y),(z,w)] --> {x:y, z:w}
exports.dict = (obj) ->
    x = {}
    for a in obj
        if a.length != 2
            throw new Error("ValueError: unexpected length of tuple")
        x[a[0]] = a[1]
    return x

# remove first occurrence of value (just like in python);
# throws an exception if val not in list.
exports.remove = (obj, val) ->
    for i in [0...obj.length]
        if obj[i] == val
            obj.splice(i, 1)
            return
    throw new Error("ValueError -- item not in array")

# convert an array of 2-element arrays to an object, e.g., [['a',5], ['xyz','10']] --> {a:5, xyz:'10'}
exports.pairs_to_obj = (v) ->
    o = {}
    for x in v
        o[x[0]] = x[1]
    return o

exports.obj_to_pairs = (obj) -> ([x,y] for x,y of obj)

# from http://stackoverflow.com/questions/4009756/how-to-count-string-occurrence-in-string via http://js2coffee.org/
exports.substring_count = (string, subString, allowOverlapping) ->
    string += ""
    subString += ""
    return string.length + 1 if subString.length <= 0
    n = 0
    pos = 0
    step = (if (allowOverlapping) then (1) else (subString.length))
    loop
        pos = string.indexOf(subString, pos)
        if pos >= 0
            n++
            pos += step
        else
            break
    return n

exports.max = (array) -> (array.reduce((a,b) -> Math.max(a, b)))

exports.min = (array) -> (array.reduce((a,b) -> Math.min(a, b)))

filename_extension_re = /(?:\.([^.]+))?$/
exports.filename_extension = (filename) ->
    filename = exports.path_split(filename).tail
    return filename_extension_re.exec(filename)[1] ? ''

exports.filename_extension_notilde = (filename) ->
    ext = exports.filename_extension(filename)
    while ext and ext[ext.length-1] == '~'  # strip tildes from the end of the extension -- put there by rsync --backup, and other backup systems in UNIX.
        ext = ext.slice(0, ext.length-1)
    return ext

# If input name foo.bar, returns object {name:'foo', ext:'bar'}.
# If there is no . in input name, returns {name:name, ext:''}
exports.separate_file_extension = (name) ->
    ext  = exports.filename_extension(name)
    if ext isnt ''
        name = name[0...name.length - ext.length - 1] # remove the ext and the .
    return {name: name, ext: ext}

# change the filename's extension to the new one.
# if there is no extension, add it.
exports.change_filename_extension = (name, new_ext) ->
    {name, ext} = exports.separate_file_extension(name)
    return "#{name}.#{new_ext}"

# shallow copy of a map
exports.copy = (obj) ->
    if not obj? or typeof(obj) isnt 'object'
        return obj
    if exports.is_array(obj)
        return obj[..]
    r = {}
    for x, y of obj
        r[x] = y
    return r

# copy of map but without some keys
exports.copy_without = (obj, without) ->
    if typeof(without) == 'string'
        without = [without]
    r = {}
    for x, y of obj
        if x not in without
            r[x] = y
    return r

# copy of map but only with some keys
exports.copy_with = (obj, w) ->
    if typeof(w) == 'string'
        w = [w]
    r = {}
    for x, y of obj
        if x in w
            r[x] = y
    return r

# From http://coffeescriptcookbook.com/chapters/classes_and_objects/cloning
exports.deep_copy = (obj) ->
    if not obj? or typeof obj isnt 'object'
        return obj

    if obj instanceof Date
        return new Date(obj.getTime())

    if obj instanceof RegExp
        flags = ''
        flags += 'g' if obj.global?
        flags += 'i' if obj.ignoreCase?
        flags += 'm' if obj.multiline?
        flags += 'y' if obj.sticky?
        return new RegExp(obj.source, flags)

    try
        newInstance = new obj.constructor()
    catch
        newInstance = {}

    for key, val of obj
        newInstance[key] = exports.deep_copy(val)

    return newInstance

# Split a pathname.  Returns an object {head:..., tail:...} where tail is
# everything after the final slash.  Either part may be empty.
# (Same as os.path.split in Python.)
exports.path_split = (path) ->
    v = path.split('/')
    return {head:v.slice(0,-1).join('/'), tail:v[v.length-1]}

# Takes a path string and file name and gives the full path to the file
exports.path_to_file = (path, file) ->
    if path == ''
        return file
    return path + '/' + file

exports.meta_file = (path, ext) ->
    if not path?
        return
    p = exports.path_split(path)
    path = p.head
    if p.head != ''
        path += '/'
    return path + "." + p.tail + ".sage-" + ext

# Given a path of the form foo/bar/.baz.ext.something returns foo/bar/baz.ext.
# For example:
#    .example.ipynb.sage-jupyter --> example.ipynb
#    tmp/.example.ipynb.sage-jupyter --> tmp/example.ipynb
#    .foo.txt.sage-chat --> foo.txt
#    tmp/.foo.txt.sage-chat --> tmp/foo.txt

exports.original_path = (path) ->
    s = exports.path_split(path)
    if s.tail[0] != '.' or s.tail.indexOf('.sage-') == -1
        return path
    ext = exports.filename_extension(s.tail)
    x = s.tail.slice((if s.tail[0] == '.' then 1 else 0),   s.tail.length - (ext.length+1))
    if s.head != ''
        x = s.head + '/' + x
    return x

ELLIPSES = "…"
# "foobar" --> "foo…"
exports.trunc = (s, max_length=1024) ->
    if not s?
        return s
    if s.length > max_length
        if max_length < 1
            throw new Error("ValueError: max_length must be >= 1")
        return s.slice(0,max_length-1) + ELLIPSES
    else
        return s

# "foobar" --> "fo…ar"
exports.trunc_middle = (s, max_length=1024) ->
    if not s?
        return s
    if s.length <= max_length
        return s
    if max_length < 1
        throw new Error("ValueError: max_length must be >= 1")
    n = Math.floor(max_length/2)
    return s.slice(0, n - 1 + (if max_length%2 then 1 else 0)) + ELLIPSES + s.slice(s.length-n)

# "foobar" --> "…bar"
exports.trunc_left = (s, max_length=1024) ->
    if not s?
        return s
    if s.length > max_length
        if max_length < 1
            throw new Error("ValueError: max_length must be >= 1")
        return ELLIPSES + s.slice(s.length-max_length+1)
    else
        return s

exports.pad_left = (s, n) ->
    if not typeof(s) == 'string'
        s = "#{s}"
    for i in [s.length...n]
        s = ' ' + s
    return s

exports.pad_right = (s, n) ->
    if not typeof(s) == 'string'
        s = "#{s}"
    for i in [s.length...n]
        s += ' '
    return s

# gives the plural form of the word if the number should be plural
exports.plural = (number, singular, plural="#{singular}s") ->
    if singular in ['GB', 'MB']
        return singular
    if number == 1 then singular else plural


exports.git_author = (first_name, last_name, email_address) -> "#{first_name} #{last_name} <#{email_address}>"

reValidEmail = (() ->
    sQtext = "[^\\x0d\\x22\\x5c\\x80-\\xff]"
    sDtext = "[^\\x0d\\x5b-\\x5d\\x80-\\xff]"
    sAtom = "[^\\x00-\\x20\\x22\\x28\\x29\\x2c\\x2e\\x3a-\\x3c\\x3e\\x40\\x5b-\\x5d\\x7f-\\xff]+"
    sQuotedPair = "\\x5c[\\x00-\\x7f]"
    sDomainLiteral = "\\x5b(" + sDtext + "|" + sQuotedPair + ")*\\x5d"
    sQuotedString = "\\x22(" + sQtext + "|" + sQuotedPair + ")*\\x22"
    sDomain_ref = sAtom
    sSubDomain = "(" + sDomain_ref + "|" + sDomainLiteral + ")"
    sWord = "(" + sAtom + "|" + sQuotedString + ")"
    sDomain = sSubDomain + "(\\x2e" + sSubDomain + ")*"
    sLocalPart = sWord + "(\\x2e" + sWord + ")*"
    sAddrSpec = sLocalPart + "\\x40" + sDomain # complete RFC822 email address spec
    sValidEmail = "^" + sAddrSpec + "$" # as whole string
    return new RegExp(sValidEmail)
)()

exports.is_valid_email_address = (email) ->
    # From http://stackoverflow.com/questions/46155/validate-email-address-in-javascript
    # but converted to Javascript; it's near the middle but claims to be exactly RFC822.
    if reValidEmail.test(email)
        return true
    else
        return false

# More canonical email address -- lower case and remove stuff between + and @.
# This is mainly used for banning users.

exports.canonicalize_email_address = (email_address) ->
    if typeof(email_address) != 'string'
        # silly, but we assume it is a string, and I'm concerned about a hacker attack involving that
        email_address = JSON.stringify(email_address)
    # remove + part from email address:   foo+bar@example.com
    i = email_address.indexOf('+')
    if i != -1
        j = email_address.indexOf('@')
        if j != -1
            email_address = email_address.slice(0,i) + email_address.slice(j)
    # make email address lower case
    return email_address.toLowerCase()


exports.lower_email_address = (email_address) ->
    if not email_address?
        return
    if typeof(email_address) != 'string'
        # silly, but we assume it is a string, and I'm concerned about a hacker attack involving that
        email_address = JSON.stringify(email_address)
    # make email address lower case
    return email_address.toLowerCase()


# Parses a string reresenting a search of users by email or non-email
# Expects the string to be delimited by commas or semicolons
#   between multiple users
#
# Non-email strings are ones without an '@' and will be split on whitespace
#
# Emails may be wrapped by angle brackets.
#   ie. <name@email.com> is valid and understood as name@email.com
#   (Note that <<name@email.com> will be <name@email.com which is not valid)
# Emails must be legal as specified by RFC822
#
# returns an object with the queries in lowercase
# eg.
# {
#    string_queries: ["firstname", "lastname", "somestring"]
#    email_queries: ["email@something.com", "justanemail@mail.com"]
# }
exports.parse_user_search = (query) ->
    queries = (q.trim().toLowerCase() for q in query.split(/,|;/))
    r = {string_queries:[], email_queries:[]}
    email_re = /<(.*)>/
    for x in queries
        if x
            # Is not an email
            if x.indexOf('@') == -1
                r.string_queries.push(x.split(/\s+/g))
            else
                # extract just the email address out
                for a in exports.split(x)
                    # Ensures that we don't throw away emails like
                    # "<validEmail>"withquotes@mail.com
                    if a[0] == '<'
                        match = email_re.exec(a)
                        a = match?[1] ? a
                    if exports.is_valid_email_address(a)
                        r.email_queries.push(a)
    return r


# Delete trailing whitespace in the string s.
exports.delete_trailing_whitespace = (s) ->
    return s.replace(/[^\S\n]+$/gm, "")


exports.assert = (condition, mesg) ->
    if not condition
        if typeof mesg == 'string'
            throw new Error(mesg)
        throw mesg


exports.retry_until_success = (opts) ->
    opts = exports.defaults opts,
        f           : exports.required   # f((err) => )
        start_delay : 100             # milliseconds
        max_delay   : 20000           # milliseconds -- stop increasing time at this point
        factor      : 1.4             # multiply delay by this each time
        max_tries   : undefined       # maximum number of times to call f
        max_time    : undefined       # milliseconds -- don't call f again if the call would start after this much time from first call
        log         : undefined
        warn        : undefined
        name        : ''
        cb          : undefined       # called with cb() on *success*; cb(error) if max_tries is exceeded

    delta = opts.start_delay
    tries = 0
    if opts.max_time?
        start_time = new Date()
    g = () ->
        tries += 1
        if opts.log?
            if opts.max_tries?
                opts.log("retry_until_success(#{opts.name}) -- try #{tries}/#{opts.max_tries}")
            if opts.max_time?
                opts.log("retry_until_success(#{opts.name}) -- try #{tries} (started #{new Date() - start_time}ms ago; will stop before #{opts.max_time}ms max time)")
            if not opts.max_tries? and not opts.max_time?
                opts.log("retry_until_success(#{opts.name}) -- try #{tries}")
        opts.f (err)->
            if err
                if err == "not_public"
                    opts.cb?("not_public")
                    return
                if err and opts.warn?
                    opts.warn("retry_until_success(#{opts.name}) -- err=#{err}")
                if opts.log?
                    opts.log("retry_until_success(#{opts.name}) -- err=#{err}")
                if opts.max_tries? and opts.max_tries <= tries
                    opts.cb?("maximum tries (=#{opts.max_tries}) exceeded - last error #{err}")
                    return
                delta = Math.min(opts.max_delay, opts.factor * delta)
                if opts.max_time? and (new Date() - start_time) + delta > opts.max_time
                    opts.cb?("maximum time (=#{opts.max_time}ms) exceeded - last error #{err}")
                    return
                setTimeout(g, delta)
            else
                if opts.log?
                    opts.log("retry_until_success(#{opts.name}) -- success")
                opts.cb?()
    g()


# Attempt (using exponential backoff) to execute the given function.
# Will keep retrying until it succeeds, then call "cb()".   You may
# call this multiple times and all callbacks will get called once the
# connection succeeds, since it keeps a stack of all cb's.
# The function f that gets called should make one attempt to do what it
# does, then on success do cb() and on failure cb(err).
# It must *NOT* call the RetryUntilSuccess callable object.
#
# Usage
#
#      @foo = retry_until_success_wrapper(f:@_foo)
#      @bar = retry_until_success_wrapper(f:@_foo, start_delay:100, max_delay:10000, exp_factor:1.5)
#
exports.retry_until_success_wrapper = (opts) ->
    _X = new RetryUntilSuccess(opts)
    return (cb) -> _X.call(cb)

class RetryUntilSuccess
    constructor: (opts) ->
        @opts = exports.defaults opts,
            f            : exports.defaults.required    # f(cb);  cb(err)
            start_delay  : 100         # initial delay beforing calling f again.  times are all in milliseconds
            max_delay    : 20000
            exp_factor   : 1.4
            max_tries    : undefined
            max_time     : undefined    # milliseconds -- don't call f again if the call would start after this much time from first call
            min_interval : 100   # if defined, all calls to f will be separated by *at least* this amount of time (to avoid overloading services, etc.)
            logname      : undefined
            verbose      : false
        if @opts.min_interval?
            if @opts.start_delay < @opts.min_interval
                @opts.start_delay = @opts.min_interval
        @f = @opts.f

    call: (cb, retry_delay) =>
        if @opts.logname?
            console.debug("#{@opts.logname}(... #{retry_delay})")

        if not @_cb_stack?
            @_cb_stack = []
        if cb?
            @_cb_stack.push(cb)
        if @_calling
            return
        @_calling = true
        if not retry_delay?
            @attempts = 0

        if @opts.logname?
            console.debug("actually calling -- #{@opts.logname}(... #{retry_delay})")

        if @opts.max_time?
            start_time = new Date()

        g = () =>
            if @opts.min_interval?
                @_last_call_time = exports.mswalltime()
            @f (err) =>
                @attempts += 1
                @_calling = false
                if err
                    if @opts.verbose
                        console.debug("#{@opts.logname}: error=#{err}")
                    if @opts.max_tries? and @attempts >= @opts.max_tries
                        while @_cb_stack.length > 0
                            @_cb_stack.pop()(err)
                        return
                    if not retry_delay?
                        retry_delay = @opts.start_delay
                    else
                        retry_delay = Math.min(@opts.max_delay, @opts.exp_factor*retry_delay)
                    if @opts.max_time? and (new Date() - start_time) + retry_delay > @opts.max_time
                        err = "maximum time (=#{@opts.max_time}ms) exceeded - last error #{err}"
                        while @_cb_stack.length > 0
                            @_cb_stack.pop()(err)
                        return
                    f = () =>
                        @call(undefined, retry_delay)
                    setTimeout(f, retry_delay)
                else
                    while @_cb_stack.length > 0
                        @_cb_stack.pop()()
        if not @_last_call_time? or not @opts.min_interval?
            g()
        else
            w = exports.mswalltime(@_last_call_time)
            if w < @opts.min_interval
                setTimeout(g, @opts.min_interval - w)
            else
                g()

# WARNING: params below have different semantics than above; these are what *really* make sense....
exports.eval_until_defined = (opts) ->
    opts = exports.defaults opts,
        code         : exports.required
        start_delay  : 100    # initial delay beforing calling f again.  times are all in milliseconds
        max_time     : 10000  # error if total time spent trying will exceed this time
        exp_factor   : 1.4
        cb           : exports.required # cb(err, eval(code))
    delay = undefined
    total = 0
    f = () ->
        result = eval(opts.code)
        if result?
            opts.cb(false, result)
        else
            if not delay?
                delay = opts.start_delay
            else
                delay *= opts.exp_factor
            total += delay
            if total > opts.max_time
                opts.cb("failed to eval code within #{opts.max_time}")
            else
                setTimeout(f, delay)
    f()


# An async debounce, kind of like the debounce in http://underscorejs.org/#debounce.
# Crucially, this async_debounce does NOT return a new function and store its state in a closure
# (like the maybe broken https://github.com/juliangruber/async-debounce), so we can use it for
# making async debounced methods in classes (see examples in SMC source code for how to do this).
exports.async_debounce = (opts) ->
    opts = defaults opts,
        f        : required   # async function f whose *only* argument is a callback
        interval : 1500       # call f at most this often (in milliseconds)
        state    : required   # store state information about debounce in this *object*
        cb       : undefined  # as if f(cb) happens -- cb may be undefined.
    {f, interval, state, cb} = opts

    call_again = ->
        n = interval + 1 - (new Date() - state.last)
        #console.log("starting timer for #{n}ms")
        state.timer = setTimeout((=>delete state.timer; exports.async_debounce(f:f, interval:interval, state:state)), n)

    if state.last? and (new Date() - state.last) <= interval
        # currently running or recently ran -- put in queue for next run
        state.next_callbacks ?= []
        if cb?
            state.next_callbacks.push(cb)
        #console.log("now have state.next_callbacks of length #{state.next_callbacks.length}")
        if not state.timer?
            call_again()
        return

    # Not running, so start running
    state.last = new Date()   # when we started running
    # The callbacks that we will call, since they were set before we started running:
    callbacks = exports.copy(state.next_callbacks ? [])
    # Plus our callback from this time.
    if cb?
        callbacks.push(cb)
    # Reset next callbacks
    delete state.next_callbacks
    #console.log("doing run with #{callbacks.length} callbacks")

    f (err) =>
        # finished running... call callbacks
        #console.log("finished running -- calling #{callbacks.length} callbacks", callbacks)
        for cb in callbacks
            cb?(err)
        callbacks = []  # ensure these callbacks don't get called again
        #console.log("finished -- have state.next_callbacks of length #{state.next_callbacks.length}")
        if state.next_callbacks? and not state.timer?
            # new calls came in since when we started, so call when we next can.
            #console.log("new callbacks came in #{state.next_callbacks.length}")
            call_again()

# Class to use for mapping a collection of strings to characters (e.g., for use with diff/patch/match).
class exports.StringCharMapping
    constructor: (opts={}) ->
        opts = exports.defaults opts,
            to_char   : undefined
            to_string : undefined
        @_to_char   = {}
        @_to_string = {}
        @_next_char = 'A'
        if opts.to_string?
            for ch, st of opts.to_string
                @_to_string[ch] = st
                @_to_char[st]  = ch
        if opts.to_char?
            for st,ch of opts.to_char
                @_to_string[ch] = st
                @_to_char[st]   = ch
        @_find_next_char()

    _find_next_char: () =>
        loop
            @_next_char = String.fromCharCode(@_next_char.charCodeAt(0) + 1)
            break if not @_to_string[@_next_char]?

    to_string: (strings) =>
        t = ''
        for s in strings
            a = @_to_char[s]
            if a?
                t += a
            else
                t += @_next_char
                @_to_char[s] = @_next_char
                @_to_string[@_next_char] = s
                @_find_next_char()
        return t

    to_array: (string) =>
        return (@_to_string[s] for s in string)

# Given a string s, return the string obtained by deleting all later duplicate characters from s.
exports.uniquify_string = (s) ->
    seen_already = {}
    t = ''
    for c in s
        if not seen_already[c]?
            t += c
            seen_already[c] = true
    return t


# Return string t=s+'\n'*k so that t ends in at least n newlines.
# Returns s itself (so no copy made) if s already ends in n newlines (a common case).
### -- not used
exports.ensure_string_ends_in_newlines = (s, n) ->
    j = s.length-1
    while j >= 0 and j >= s.length-n and s[j] == '\n'
        j -= 1
    # Now either j = -1 or s[j] is not a newline (and it is the first character not a newline from the right).
    console.debug(j)
    k = n - (s.length - (j + 1))
    console.debug(k)
    if k == 0
        return s
    else
        return s + Array(k+1).join('\n')   # see http://stackoverflow.com/questions/1877475/repeat-character-n-times
###




# Used in the database, etc., for different types of users of a project

exports.PROJECT_GROUPS = ['owner', 'collaborator', 'viewer', 'invited_collaborator', 'invited_viewer']


# turn an arbitrary string into a nice clean identifier that can safely be used in an URL
exports.make_valid_name = (s) ->
    # for now we just delete anything that isn't alphanumeric.
    # See http://stackoverflow.com/questions/9364400/remove-not-alphanumeric-characters-from-string-having-trouble-with-the-char/9364527#9364527
    # whose existence surprised me!
    return s.replace(/\W/g, '_').toLowerCase()



# format is 2014-04-04-061502
exports.parse_bup_timestamp = (s) ->
    v = [s.slice(0,4), s.slice(5,7), s.slice(8,10), s.slice(11,13), s.slice(13,15), s.slice(15,17), '0']
    return new Date("#{v[1]}/#{v[2]}/#{v[0]} #{v[3]}:#{v[4]}:#{v[5]} UTC")

exports.matches = (s, words) ->
    for word in words
        if s.indexOf(word) == -1
            return false
    return true

exports.hash_string = (s) ->
    # see http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
    hash = 0
    i = undefined
    chr = undefined
    len = undefined
    return hash if s.length is 0
    i = 0
    len = s.length
    while i < len
        chr = s.charCodeAt(i)
        hash = ((hash << 5) - hash) + chr
        hash |= 0 # convert to 32-bit integer
        i++
    return hash




exports.parse_hashtags = (t) ->
    # return list of pairs (i,j) such that t.slice(i,j) is a hashtag (starting with #).
    v = []
    if not t?
        return v
    base = 0
    while true
        i = t.indexOf('#')
        if i == -1 or i == t.length-1
            return v
        base += i+1
        if t[i+1] == '#' or not (i == 0 or t[i-1].match(/\s/))
            t = t.slice(i+1)
            continue
        t = t.slice(i+1)
        # find next whitespace or non-alphanumeric or dash
        # TODO: this lines means hashtags must be US ASCII --
        #    see http://stackoverflow.com/questions/1661197/valid-characters-for-javascript-variable-names
        i = t.match(/\s|[^A-Za-z0-9_\-]/)
        if i
            i = i.index
        else
            i = -1
        if i == 0
            # hash followed immediately by whitespace -- markdown desc
            base += i+1
            t = t.slice(i+1)
        else
            # a hash tag
            if i == -1
                # to the end
                v.push([base-1, base+t.length])
                return v
            else
                v.push([base-1, base+i])
                base += i+1
                t = t.slice(i+1)

mathjax_delim = [['$$','$$'], ['\\(','\\)'], ['\\[','\\]'],
                 ['\\begin{equation}', '\\end{equation}'],
                 ['\\begin{equation*}', '\\end{equation*}'],
                 ['\\begin{align}', '\\end{align}'],
                 ['\\begin{align*}', '\\end{align*}'],
                 ['\\begin{eqnarray}', '\\end{eqnarray}'],
                 ['\\begin{eqnarray*}', '\\end{eqnarray*}'],
                 ['$', '$']  # must be after $$
                ]

exports.parse_mathjax = (t) ->
    # Return list of pairs (i,j) such that t.slice(i,j) is a mathjax, including delimiters.
    # The delimiters are given in the mathjax_delim list above.
    v = []
    if not t?
        return v
    i = 0
    while i < t.length
        # escaped dollar sign, ignored
        if t.slice(i, i+2) == '\\$'
            i += 2
            continue
        for d in mathjax_delim
            contains_linebreak = false
            # start of a formula detected
            if t.slice(i, i + d[0].length) == d[0]
                # a match -- find the close
                j = i+1
                while j < t.length and t.slice(j, j + d[1].length) != d[1]
                    next_char = t.slice(j, j+1)
                    if next_char == "\n"
                        contains_linebreak = true
                        if d[0] == "$"
                            break
                    # deal with ending ` char in markdown (mathjax doesn't stop there)
                    prev_char = t.slice(j-1, j)
                    if next_char == "`" and prev_char != '\\' # implicitly also covers "```"
                        j -= 1 # backtrack one step
                        break
                    j += 1
                j += d[1].length
                # filter out the case, where there is just one $ in one line (e.g. command line, USD, ...)
                at_end_of_string = j >= t.length
                if !(d[0] == "$" and (contains_linebreak or at_end_of_string))
                    v.push([i,j])
                i = j
                break
        i += 1
    return v

# If you're going to set some innerHTML then mathjax it,
exports.mathjax_escape = (html) ->
    return html.replace(/&(?!#?\w+;)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")


# Return true if (1) path is contained in one
# of the given paths (a list of strings) -- or path without
# zip extension is in paths.
# Always returns false if path is undefined/null (since that might be dangerous, right)?
exports.path_is_in_public_paths = (path, paths) ->
    return exports.containing_public_path(path, paths)?

# returns a string in paths if path is public because of that string
# Otherwise, returns undefined.
# IMPORTANT: a possible returned string is "", which is falsey but defined!
exports.containing_public_path = (path, paths) ->
    if paths.length == 0
        return
    if not path?
        return
    if path.indexOf('../') != -1
        # just deny any potentially trickiery involving relative path segments (TODO: maybe too restrictive?)
        return
    for p in paths
        if p == ""  # the whole project is public, which matches everything
            return ""
        if path == p
            # exact match
            return p
        if path.slice(0,p.length+1) == p + '/'
            return p
    if exports.filename_extension(path) == "zip"
        # is path something_public.zip ?
        return exports.containing_public_path(path.slice(0,path.length-4), paths)
    return undefined

# encode a UNIX path, which might have # and % in it.
exports.encode_path = (path) ->
    path = encodeURI(path)  # doesn't escape # and ?, since they are special for urls (but not unix paths)
    return path.replace(/#/g,'%23').replace(/\?/g,'%3F')


# This adds a method _call_with_lock to obj, which makes it so it's easy to make it so only
# one method can be called at a time of an object -- all calls until completion
# of the first one get an error.

exports.call_lock = (opts) ->
    opts = exports.defaults opts,
        obj       : exports.required
        timeout_s : 30  # lock expire timeout after this many seconds

    obj = opts.obj

    obj._call_lock = () ->
        obj.__call_lock = true
        obj.__call_lock_timeout = () ->
            obj.__call_lock = false
            delete obj.__call_lock_timeout
        setTimeout(obj.__call_lock_timeout, opts.timeout_s * 1000)

    obj._call_unlock = () ->
        if obj.__call_lock_timeout?
            clearTimeout(obj.__call_lock_timeout)
            delete obj.__call_lock_timeout
        obj.__call_lock = false

    obj._call_with_lock = (f, cb) ->
        if obj.__call_lock
            cb?("error -- hit call_lock")
            return
        obj._call_lock()
        f (args...) ->
            obj._call_unlock()
            cb?(args...)

exports.cmp = (a,b) ->
    if a < b
        return -1
    else if a > b
        return 1
    return 0

exports.cmp_array = (a,b) ->
    for i in [0...Math.max(a.length, b.length)]
        c = exports.cmp(a[i],b[i])
        if c
            return c
    return 0

exports.cmp_Date = (a,b) ->
    if not a?
        return -1
    if not b?
        return 1
    if a < b
        return -1
    else if a > b
        return 1
    return 0   # note: a == b for Date objects doesn't work as expected, but that's OK here.

exports.timestamp_cmp = (a,b,field='timestamp') ->
    return -exports.cmp_Date(a[field], b[field])

timestamp_cmp0 = (a,b,field='timestamp') ->
    return exports.cmp_Date(a[field], b[field])

exports.field_cmp = (field) ->
    return (a, b) -> exports.cmp(a[field], b[field])

#####################
# temporary location for activity_log code, shared by front and backend.
#####################

class ActivityLog
    constructor: (opts) ->
        opts = exports.defaults opts,
            events        : undefined
            account_id    : exports.required   # user
            notifications : {}
        @notifications = opts.notifications
        @account_id = opts.account_id
        if opts.events?
            @process(opts.events)

    obj: () =>
        return {notifications:@notifications, account_id:@account_id}

    path: (e) => "#{e.project_id}/#{e.path}"

    process: (events) =>
        #t0 = exports.mswalltime()
        by_path = {}
        for e in events
            ##if e.account_id == @account_id  # ignore our own events
            ##    continue
            key = @path(e)
            events_with_path = by_path[key]
            if not events_with_path?
                events_with_path = by_path[key] = [e]
            else
                events_with_path.push(e)
        for path, events_with_path of by_path
            events_with_path.sort(timestamp_cmp0)   # oldest to newest
            for event in events_with_path
                @_process_event(event, path)
        #winston.debug("ActivityLog: processed #{events.length} in #{exports.mswalltime(t0)}ms")

    _process_event: (event, path) =>
        # process the given event, assuming all older events have been
        # processed already; this updates the notifications object.
        if not path?
            path = @path(event)
        a = @notifications[path]
        if not a?
            @notifications[path] = a = {}
        a.timestamp = event.timestamp
        a.id = event.id
        #console.debug("process_event", event, path)
        #console.debug(event.seen_by?.indexOf(@account_id))
        #console.debug(event.read_by?.indexOf(@account_id))
        if event.seen_by? and event.seen_by.indexOf(@account_id) != -1
            a.seen = event.timestamp
        if event.read_by? and event.read_by.indexOf(@account_id) != -1
            a.read = event.timestamp

        if event.action?
            who = a[event.action]
            if not who?
                who = a[event.action] = {}
            who[event.account_id] = event.timestamp
            # The code below (instead of the line above) would include *all* times.
            # I'm not sure whether or not I want to use that information, since it
            # could get really big.
            #times = who[event.account_id]
            #if not times?
            #    times = who[event.account_id] = []
            #times.push(event.timestamp)


exports.activity_log = (opts) -> new ActivityLog(opts)

# see http://stackoverflow.com/questions/1144783/replacing-all-occurrences-of-a-string-in-javascript
exports.replace_all = (string, search, replace) ->
    string.split(search).join(replace)

exports.remove_c_comments = (s) ->
    while true
        i = s.indexOf('/*')
        if i == -1
            return s
        j = s.indexOf('*/')
        if i >= j
            return s
        s = s.slice(0, i) + s.slice(j+2)

exports.date_to_snapshot_format = (d) ->
    if not d?
        d = 0
    if typeof(d) == "number"
        d = new Date(d)
    s = d.toJSON()
    s = s.replace('T','-').replace(/:/g, '')
    i = s.lastIndexOf('.')
    return s.slice(0,i)

exports.stripe_date = (d) ->
    return new Date(d*1000).toLocaleDateString( 'lookup', { year: 'numeric', month: 'long', day: 'numeric' })
    # fixing the locale to en-US (to pass tests) and (not necessary, but just in case) also the time zone
    #return new Date(d*1000).toLocaleDateString(
    #    'en-US',
    #        year: 'numeric'
    #        month: 'long'
    #        day: 'numeric'
    #        weekday: "long"
    #        timeZone: 'UTC'
    #)

exports.to_money = (n) ->
    # see http://stackoverflow.com/questions/149055/how-can-i-format-numbers-as-money-in-javascript
    # TODO: replace by using react-intl...
    return n.toFixed(2).replace(/(\d)(?=(\d{3})+\.)/g, '$1,')

exports.stripe_amount = (units, currency) ->  # input is in pennies
    if currency != 'usd'
        throw Error("not-implemented currency #{currency}")
    s = "$#{exports.to_money(units/100)}"
    if s.slice(s.length-3) == '.00'
        s = s.slice(0, s.length-3)
    return s

exports.capitalize = (s) ->
    if s?
        return s.charAt(0).toUpperCase() + s.slice(1)

exports.is_array = is_array = (obj) ->
    return Object.prototype.toString.call(obj) == "[object Array]"

exports.is_integer = Number.isInteger
if not exports.is_integer?
    exports.is_integer = (n) -> typeof(n)=='number' and (n % 1) == 0

exports.is_string = (obj) ->
    return typeof(obj) == 'string'

# An object -- this is more constraining that typeof(obj) == 'object', e.g., it does
# NOT include Date.
exports.is_object = is_object = (obj) ->
    return Object.prototype.toString.call(obj) == "[object Object]"

exports.is_date = is_date = (obj) ->
    return obj instanceof Date

# get a subarray of all values between the two given values inclusive, provided in either order
exports.get_array_range = (arr, value1, value2) ->
    index1 = arr.indexOf(value1)
    index2 = arr.indexOf(value2)
    if index1 > index2
        [index1, index2] = [index2, index1]
    return arr[index1..index2]

# Specific, easy to read: describe amount of time before right now
# Use negative input for after now (i.e., in the future).
exports.milliseconds_ago = (ms) -> new Date(new Date() - ms)
exports.seconds_ago      = (s)  -> exports.milliseconds_ago(1000*s)
exports.minutes_ago      = (m)  -> exports.seconds_ago(60*m)
exports.hours_ago        = (h)  -> exports.minutes_ago(60*h)
exports.days_ago         = (d)  -> exports.hours_ago(24*d)
exports.weeks_ago        = (w)  -> exports.days_ago(7*w)
exports.months_ago       = (m)  -> exports.days_ago(30.5*m)

if window?
    # BROWSER Versions of the above, but give the relevant point in time but
    # on the *server*.  These are only available in the web browser.
    exports.server_time             = ()   -> new Date(new Date() - parseFloat(exports.get_local_storage('clock_skew') ? 0))
    exports.server_milliseconds_ago = (ms) -> new Date(new Date() - ms - parseFloat(exports.get_local_storage('clock_skew') ? 0))
    exports.server_seconds_ago      = (s)  -> exports.server_milliseconds_ago(1000*s)
    exports.server_minutes_ago      = (m)  -> exports.server_seconds_ago(60*m)
    exports.server_hours_ago        = (h)  -> exports.server_minutes_ago(60*h)
    exports.server_days_ago         = (d)  -> exports.server_hours_ago(24*d)
    exports.server_weeks_ago        = (w)  -> exports.server_days_ago(7*w)
    exports.server_months_ago       = (m)  -> exports.server_days_ago(30.5*m)
else
    # On the server, these functions are aliased to the functions above, since
    # we assume that the server clocks are sufficiently accurate.  Providing
    # these functions makes it simpler to write code that runs on both the
    # frontend and the backend.
    exports.server_time             = -> new Date()
    exports.server_milliseconds_ago = exports.milliseconds_ago
    exports.server_seconds_ago      = exports.seconds_ago
    exports.server_minutes_ago      = exports.minutes_ago
    exports.server_hours_ago        = exports.hours_ago
    exports.server_days_ago         = exports.days_ago
    exports.server_weeks_ago        = exports.weeks_ago
    exports.server_months_ago       = exports.months_ago


# Specific easy to read and describe point in time before another point in time tm.
# (The following work exactly as above if the second argument is excluded.)
# Use negative input for first argument for that amount of time after tm.
exports.milliseconds_before = (ms, tm) -> new Date((tm ? (new Date())) - ms)
exports.seconds_before      = (s, tm)  -> exports.milliseconds_before(1000*s, tm)
exports.minutes_before      = (m, tm)  -> exports.seconds_before(60*m, tm)
exports.hours_before        = (h, tm)  -> exports.minutes_before(60*h, tm)
exports.days_before         = (d, tm)  -> exports.hours_before(24*d, tm)
exports.weeks_before        = (d, tm)  -> exports.days_before(7*d, tm)
exports.months_before       = (d, tm)  -> exports.days_before(30.5*d, tm)

# time this many seconds in the future (or undefined)
exports.expire_time = (s) ->
    if s then new Date((new Date() - 0) + s*1000)

exports.YEAR = new Date().getFullYear()

# Round the given number to 1 decimal place
exports.round1 = round1 = (num) ->
    Math.round(num * 10) / 10

# Round given number to 2 decimal places
exports.round2 = round2 = (num) ->
    # padding to fix floating point issue (see http://stackoverflow.com/questions/11832914/round-to-at-most-2-decimal-places-in-javascript)
    Math.round((num + 0.00001) * 100) / 100

exports.seconds2hms = seconds2hms = (secs) ->
    s = round2(secs % 60)
    m = Math.floor(secs / 60) % 60
    h = Math.floor(secs / 60 / 60)
    if h == 0 and m == 0
        return "#{s}s"
    if h > 0
        return "#{h}h#{m}m#{s}s"
    if m > 0
        return "#{m}m#{s}s"

# returns the number parsed from the input text, or undefined if invalid
# rounds to the nearest 0.01 if round_number is true (default : true)
# allows negative numbers if allow_negative is true (default : false)
exports.parse_number_input = (input, round_number=true, allow_negative=false) ->
    input = (input + "").split('/')
    if input.length != 1 and input.length != 2
        return undefined
    if input.length == 2
        val = parseFloat(input[0]) / parseFloat(input[1])
    if input.length == 1
        if isNaN(input) or "#{input}".trim() is ''
            # Shockingly, whitespace returns false for isNaN!
            return undefined
        val = parseFloat(input)
    if round_number
        val = round2(val)
    if isNaN(val) or val == Infinity or (val < 0 and not allow_negative)
        return undefined
    return val

exports.range = (n, m) ->
    if not m?
        return [0...n]
    else
        return [n...m]

# arithmetic of maps with codomain numbers; missing values default to 0
exports.map_sum = (a, b) ->
    if not a?
        return b
    if not b?
        return a
    c = {}
    for k, v of a
        c[k] = v + (b[k] ? 0)
    for k, v of b
        c[k] ?= v
    return c

exports.map_diff = (a, b) ->
    if not b?
        return a
    if not a?
        c = {}
        for k,v of b
            c[k] = -v
        return c
    c = {}
    for k, v of a
        c[k] = v - (b[k] ? 0)
    for k, v of b
        c[k] ?= -v
    return c

# limit the values in a by the values of b
# or just by b if b is a number
exports.map_limit = (a, b) ->
    c = {}
    if typeof b == 'number'
        for k, v of a
            c[k] = Math.min(v, b)
    else
        for k, v of a
            c[k] = Math.min(v, (b[k] ? Number.MAX_VALUE))
    return c

# arithmetic sum of an array
exports.sum = (arr, start=0) -> underscore.reduce(arr, ((a, b) -> a+b), start)

# replace map in place by the result of applying f to each
# element of the codomain of the map.  Also return the modified map.
exports.apply_function_to_map_values = apply_function_to_map_values = (map, f) ->
    for k, v of map
        map[k] = f(v)
    return map

# modify map by coercing each element of codomain to a number, with false->0 and true->1
exports.coerce_codomain_to_numbers = (map) ->
    apply_function_to_map_values map, (x)->
        if typeof(x) == 'boolean'
            if x then 1 else 0
        else
            parseFloat(x)

# returns true if the given map is undefined or empty, or all the values are falsy
exports.is_zero_map = (map) ->
    if not map?
        return true
    for k,v of map
        if v
            return false
    return true

# Returns copy of map with no undefined/null values (recursive).
# Doesn't modify map.  If map is an array, just returns it
# with no change even if it has undefined values.
exports.map_without_undefined = map_without_undefined = (map) ->
    if is_array(map)
        return map
    if not map?
        return
    new_map = {}
    for k, v of map
        if not v?
            continue
        else
            new_map[k] = if is_object(v) then map_without_undefined(v) else v
    return new_map

exports.map_mutate_out_undefined = (map) ->
    for k, v of map
        if not v?
            delete map[k]



# foreground; otherwise, return false.
exports.should_open_in_foreground = (e) ->
    # for react.js synthetic mouse events, where e.which is undefined!
    if e.constructor.name == 'SyntheticMouseEvent'
        e = e.nativeEvent
    #console.log("e: #{e}, e.which: #{e.which}", e)
    return not (e.which == 2 or e.metaKey or e.altKey or e.ctrlKey)

# Like Python's enumerate
exports.enumerate = (v) ->
    i = 0
    w = []
    for x in v
        w.push([i,x])
        i += 1
    return w

# escape everything in a regex
exports.escapeRegExp = escapeRegExp = (str) ->
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")

# smiley-fication of an arbitrary string
smileys_definition = [
    [':-)',          "😁"],
    [':-(',          "😞"],
    ['<3',           "♡",             null, '\\b'],
    [':shrug:',      "¯\\\\_(ツ)_/¯"],
    ['o_o',          "סּ_\סּ",         '\\b', '\\b'],
    [':-p',          "😛",            null, '\\b'],
    ['>_<',          "😆"],
    ['^^',           "😄",            '^',   '\S'],
    ['^^ ',          "😄 "],
    [' ^^',          " 😄"],
    [';-)',          "😉"],
    ['-_-',          "😔"],
    [':-\\',         "😏"],
    [':omg:',        "😱"]
]

smileys = []

for smiley in smileys_definition
    s = escapeRegExp(smiley[0])
    if smiley[2]?
        s = smiley[2] + s
    if smiley[3]?
        s = s + smiley[3]
    smileys.push([RegExp(s, 'g'), smiley[1]])

exports.smiley = (opts) ->
    opts = exports.defaults opts,
        s           : exports.required
        wrap        : undefined
    # de-sanitize possible sanitized characters
    s = opts.s.replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    for subs in smileys
        repl = subs[1]
        if opts.wrap
            repl = opts.wrap[0] + repl + opts.wrap[1]
        s = s.replace(subs[0], repl)
    return s

_ = underscore

exports.smiley_strings = () ->
    return _.filter(_.map(smileys_definition, _.first), (x) -> ! _.contains(['^^ ', ' ^^'], x))

# converts an array to a "human readable" array
exports.to_human_list = (arr) ->
    arr = _.map(arr, (x) -> x.toString())
    if arr.length > 1
        return arr[...-1].join(", ") + " and " + arr[-1..]
    else if arr.length == 1
        return arr[0].toString()
    else
        return ""

exports.emoticons = exports.to_human_list(exports.smiley_strings())

exports.history_path = (path) ->
    p = exports.path_split(path)
    return if p.head then "#{p.head}/.#{p.tail}.sage-history" else ".#{p.tail}.sage-history"

# This is a convenience function to provide as a callback when working interactively.
_done = (n, args...) ->
    start_time = new Date()
    f = (args...) ->
        if n != 1
            try
                args = [JSON.stringify(args, null, n)]
            catch
                # do nothing
        console.log("*** TOTALLY DONE! (#{(new Date() - start_time)/1000}s since start) ", args...)
    if args.length > 0
        f(args...)
    else
        return f

exports.done = (args...) -> _done(0, args...)
exports.done1 = (args...) -> _done(1, args...)
exports.done2 = (args...) -> _done(2, args...)


smc_logger_timestamp = smc_logger_timestamp_last = smc_start_time = new Date().getTime() / 1000.0

exports.get_start_time_ts = ->
    return new Date(smc_start_time * 1000)

exports.get_uptime = ->
    return seconds2hms((new Date().getTime() / 1000.0) - smc_start_time)

exports.log = () ->
    smc_logger_timestamp = new Date().getTime() / 1000.0
    t  = seconds2hms(smc_logger_timestamp - smc_start_time)
    dt = seconds2hms(smc_logger_timestamp - smc_logger_timestamp_last)
    # support for string interpolation for the actual console.log
    [msg, args...] = Array.prototype.slice.call(arguments)
    prompt = "[#{t} Δ #{dt}]"
    if _.isString(msg)
        prompt = "#{prompt} #{msg}"
        console.log_original(prompt, args...)
    else
        console.log_original(prompt, msg, args...)
    smc_logger_timestamp_last = smc_logger_timestamp

exports.wrap_log = () ->
    if not exports.RUNNING_IN_NODE and window?
        window.console.log_original = window.console.log
        window.console.log = exports.log

# to test exception handling
exports.this_fails = ->
    return exports.op_to_function('noop')

# derive the console initialization filename from the console's filename
# used in webapp and console_server_child
exports.console_init_filename = (fn) ->
    x = exports.path_split(fn)
    x.tail = ".#{x.tail}.init"
    if x.head == ''
        return x.tail
    return [x.head, x.tail].join("/")

exports.has_null_leaf = has_null_leaf = (obj) ->
    for k, v of obj
        if v == null or (typeof(v) == 'object' and has_null_leaf(v))
            return true
    return false

# Peer Grading
# this function takes a list of students (actually, arbitrary objects)
# and a number N of the desired number of peers per student.
# It returns a dictionary, mapping each student to a list of peers.
exports.peer_grading = (students, N=2) ->
    if N <= 0
        throw "Number of peer assigments must be at least 1"
    if students.length <= N
        throw "You need at least #{N + 1} students"

    asmnt = {}
    # make output dict keys sorted like students input array
    students.forEach((s) -> asmnt[s] = [])
    # randomize peer assignments
    s_random = underscore.shuffle(students)

    # the peer groups are selected here. Think of nodes in a circular graph,
    # and node i is associated with i+1 up to i+N
    L = students.length
    for i in [0...L]
        asmnt[s_random[i]] = (s_random[(i + idx) % L] for idx in [1..N])

    # sort each peer group by the order of the `student` input list
    for k, v of asmnt
        asmnt[k] = underscore.sortBy(v, (s) -> students.indexOf(s))
    return asmnt

# demonstration of the above; for tests see misc-test.coffee
exports.peer_grading_demo = (S = 10, N = 2) ->
    peer_grading = exports.peer_grading
    students = [0...S]
    students = ("S-#{s}" for s in students)
    result = peer_grading(students, N=N)
    console.log("#{S} students graded by #{N} peers")
    for k, v of result
        console.log("#{k} ←→ #{v}")
    return result

# converts ticket number to support ticket url (currently zendesk)
exports.ticket_id_to_ticket_url = (tid) ->
    return "https://sagemathcloud.zendesk.com/requests/#{tid}"

# Apply various transformations to url's before downloading a file using the "+ New" from web thing:
# This is useful, since people often post a link to a page that *hosts* raw content, but isn't raw
# content, e.g., ipython nbviewer, trac patches, github source files (or repos?), etc.

exports.transform_get_url = (url) ->  # returns something like {command:'wget', args:['http://...']}
    URL_TRANSFORMS =
        'http://trac.sagemath.org/attachment/ticket/':'http://trac.sagemath.org/raw-attachment/ticket/'
        'http://nbviewer.ipython.org/urls/':'https://'
    if exports.startswith(url, "https://github.com/") and url.indexOf('/blob/') != -1
        url = url.replace("https://github.com", "https://raw.github.com").replace("/blob/","/")

    if exports.startswith(url, 'git@github.com:')
        command = 'git'  # kind of useless due to host keys...
        args = ['clone', url]
    else if url.slice(url.length-4) == ".git"
        command = 'git'
        args = ['clone', url]
    else
        # fall back
        for a,b of URL_TRANSFORMS
            url = url.replace(a,b)  # only replaces first instance, unlike python.  ok for us.
        command = 'wget'
        args = [url]

    return {command:command, args:args}

exports.ensure_bound = (x, min, max) ->
    return min if x < min
    return max if x > max
    return x

# convert a file path to the "name" of the underlying editor tab.
# needed because otherwise filenames like 'log' would cause problems
exports.path_to_tab = (name) ->
    "editor-#{name}"

# assumes a valid editor tab name...
# If invalid or undefined, returns undefined
exports.tab_to_path = (name) ->
    if name? and name.substring(0, 7) == "editor-"
        name.substring(7)

# suggest a new filename when duplicating it
# 1. strip extension, split at '_' or '-' if it exists
# try to parse a number, if it works, increment it, etc.
exports.suggest_duplicate_filename = (name) ->
    {name, ext} = exports.separate_file_extension(name)
    idx_dash = name.lastIndexOf('-')
    idx_under = name.lastIndexOf('_')
    idx = exports.max([idx_dash, idx_under])
    new_name = null
    if idx > 0
        [prfx, ending] = [name[...idx+1], name[idx+1...]]
        num = parseInt(ending)
        if not Number.isNaN(num)
            new_name = "#{prfx}#{num+1}"
    new_name ?= "#{name}-1"
    if ext?.length > 0
        new_name += ".#{ext}"
    return new_name


# Wrapper around localStorage, so we can safely touch it without raising an
# exception if it is banned (like in some browser modes) or doesn't exist.
# See https://github.com/sagemathinc/smc/issues/237

exports.set_local_storage = (key, val) ->
    try
        localStorage[key] = val
    catch e
        console.warn("localStorage set error -- #{e}")

exports.get_local_storage = (key) ->
    try
        return localStorage[key]
    catch e
        console.warn("localStorage get error -- #{e}")


exports.delete_local_storage = (key) ->
    try
        delete localStorage[key]
    catch e
        console.warn("localStorage delete error -- #{e}")


exports.has_local_storage = () ->
    try
        TEST = '__smc_test__'
        localStorage[TEST] = 'x'
        delete localStorage[TEST]
        return true
    catch e
        return false

exports.local_storage_length = () ->
    try
        return localStorage.length
    catch e
        return 0

# Takes an object representing a directed graph shaped as follows:
# DAG =
#     node1 : []
#     node2 : ["node1"]
#     node3 : ["node1", "node2"]
#
# Which represents the following graph:
#   node1 ----> node2
#     |           |
#    \|/          |
#   node3 <-------|
#
# Returns a topological ordering of the DAG
#     object = ["node1", "node2", "node3"]
#
# Throws an error if cyclic
# Runs in O(N + E) where N is the number of nodes and E the number of edges
# Kahn, Arthur B. (1962), "Topological sorting of large networks", Communications of the ACM
exports.top_sort = (DAG, opts={omit_sources:false}) ->
    {omit_sources} = opts
    source_names = []
    num_edges    = 0
    data         = {}

    # Ready the data for top sort
    for name, parents of DAG
        data[name] ?= {}
        node = data[name]
        node.name = name
        node.children ?= []
        node.parent_set = new Set(parents)
        for parent_name in parents
            data[parent_name] ?= {}
            data[parent_name].children ?= []
            data[parent_name].children.push(node)
        if parents.length == 0
            source_names.push(name)
        else
            num_edges += parents.length

    # Top sort! Non-recursive method since recursion is way slow in javascript
    path = []
    num_sources = source_names.length
    while source_names.length > 0
        curr_name = source_names.shift()
        path.push(curr_name)
        for child in data[curr_name].children
            child.parent_set.delete(curr_name)
            num_edges -= 1
            if child.parent_set.size == 0
                source_names.push(child.name)

    # Detect lack of sources
    if num_sources == 0
        throw new Error "No sources were detected"

    # Detect cycles
    if num_edges != 0
        window?._DAG = DAG  # so it's possible to debug in browser
        throw new Error "Store has a cycle in its computed values"

    if omit_sources
        return path.slice(num_sources)
    else
        return path

# Takes an object with keys and values where
# the values are functions and keys are the names
# of the functions.
# Dependency graph is created from the property
# `dependency_names` found on the values
# Returns an object shaped
# DAG =
#     func_name1 : []
#     func_name2 : ["func_name1"]
#     func_name3 : ["func_name1", "func_name2"]
#
# Which represents the following graph:
#   func_name1 ----> func_name2
#     |                |
#    \|/               |
#   func_name3 <-------|
exports.create_dependency_graph = (object) =>
    DAG = {}
    for name, written_func of object
        DAG[name] = written_func.dependency_names ? []
    return DAG

# Binds all functions in objects of 'arr_objects' to 'scope'
# Preserves all properties and the toString of these functions
# Returns a new array of objects in the same order given
# Leaves arr_objects unaltered.
exports.bind_objects = (scope, arr_objects) ->
    return underscore.map arr_objects, (object) =>
        return underscore.mapObject object, (val) =>
            if typeof val == 'function'
                original_toString = val.toString()
                bound_func = val.bind(scope)
                bound_func.toString = () => original_toString
                Object.assign(bound_func, val)
                return bound_func
            else
                return val

# Remove all whitespace from string s.
# see http://stackoverflow.com/questions/6623231/remove-all-white-spaces-from-text
exports.remove_whitespace = (s) ->
    return s.replace(/\s/g,'')


# ORDER MATTERS! -- this gets looped over and searches happen -- so the 1-character ops must be last.
exports.operators = ['!=', '<>', '<=', '>=', '==', '<', '>', '=']

exports.op_to_function = (op) ->
    switch op
        when '=', '=='
            return (a,b) -> a == b
        when '!=', '<>'
            return (a,b) -> a != b
        when '<='
            return (a,b) -> a <= b
        when '>='
            return (a,b) -> a >= b
        when '<'
            return (a,b) -> a < b
        when '>'
            return (a,b) -> a > b
        else
            throw Error("operator must be one of '#{JSON.stringify(exports.operators)}'")
