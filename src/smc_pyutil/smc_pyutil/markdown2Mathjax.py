__version_info__ = (0,3,9)
__version__ = '.'.join(map(str,__version_info__))
__author__ = "Matthew Young"

import re
from markdown2 import markdown

def break_tie(inline,equation):
    """If one of the delimiters is a substring of the other (e.g., $ and $$) it is possible that the two will begin at the same location.  In this case we need some criteria to break the tie and decide which operation takes precedence.  I've gone with the longer of the two delimiters takes priority (for example, $$ over $).  This function should return a 2 for the equation block taking precedence, a 1 for the inline block.  The magic looking return statement is to map 0->2 and 1->1."""
    tmp=(inline.end()-inline.start() > equation.end()-equation.start())
    return (tmp*3+2)%4

def markdown_safe(placeholder):
    """Is the placeholder changed by markdown?  If it is, this isn't a valid placeholder."""
    mdstrip=re.compile("<p>(.*)</p>\n")
    md=markdown(placeholder)
    mdp=mdstrip.match(md)
    if mdp and mdp.group(1)==placeholder:
        return True
    return False

def mathdown(text):
    """Convenience function which runs the basic markdown and mathjax processing sequentially."""
    tmp=sanitizeInput(text)
    return reconstructMath(markdown(tmp[0]),tmp[1])

def sanitizeInput(string,inline_delims=["$","$"],equation_delims=["$$","$$"],placeholder="$0$"):
    """Given a string that will be passed to markdown, the content of the different math blocks is stripped out and replaced by a placeholder which MUST be ignored by markdown.  A list is returned containing the text with placeholders and a list of the stripped out equations.  Note that any pre-existing instances of the placeholder are "replaced" with themselves and a corresponding dummy entry is placed in the returned codeblock.  The sanitized string can then be passed safetly through markdown and then reconstructed with reconstructMath.

    There are potential four delimiters that can be specified.  The left and right delimiters for inline and equation mode math.  These can potentially be anything that isn't already used by markdown and is compatible with mathjax (see documentation for both).
    """
    #Check placeholder is valid.
    if not markdown_safe(placeholder):
        raise ValueError("Placeholder %s altered by markdown processing." % placeholder)
    #really what we want is a reverse markdown function, but as that's too much work, this will do
    inline_left=re.compile("(?<!\\\\)"+re.escape(inline_delims[0]))
    inline_right=re.compile("(?<!\\\\)"+re.escape(inline_delims[1]))
    equation_left=re.compile("(?<!\\\\)"+re.escape(equation_delims[0]))
    equation_right=re.compile("(?<!\\\\)"+re.escape(equation_delims[1]))
    placeholder_re = re.compile("(?<!\\\\)"+re.escape(placeholder))
    placeholder_scan = placeholder_re.scanner(string)
    ilscanner=[inline_left.scanner(string),inline_right.scanner(string)]
    eqscanner=[equation_left.scanner(string),equation_right.scanner(string)]
    scanners=[placeholder_scan,ilscanner,eqscanner]
    #There are 3 types of blocks, inline math, equation math and occurances of the placeholder in the text
    #inBlack is 0 for a placeholder, 1 for inline block, 2 for equation
    inBlock=0
    post=-1
    stlen=len(string)
    startmatches=[placeholder_scan.search(),ilscanner[0].search(),eqscanner[0].search()]
    startpoints=[stlen,stlen,stlen]
    startpoints[0]= startmatches[0].start() if startmatches[0] else stlen
    startpoints[1]= startmatches[1].start() if startmatches[1] else stlen
    startpoints[2]= startmatches[2].start() if startmatches[2] else stlen
    terminator=-1
    sanitizedString=''
    codeblocks=[]
    while 1:
        #find the next point of interest.
	while startmatches[0] and startmatches[0].start()<post:
	    startmatches[0]=placeholder_scan.search()
            startpoints[0]= startmatches[0].start() if startmatches[0] else stlen
        while startmatches[1] and startmatches[1].start()<post:
            startmatches[1]=ilscanner[0].search()
            startpoints[1]= startmatches[1].start() if startmatches[1] else stlen
        while startmatches[2] and startmatches[2].start()<post:
            startmatches[2]=eqscanner[0].search()
            startpoints[2]= startmatches[2].start() if startmatches[2] else stlen
        #Found start of next block of each type
	#Placeholder type always takes precedence if it exists and is next...
	if startmatches[0] and min(startpoints)==startpoints[0]:
	    #We can do it all in one!
	    #First add the "stripped" code to the blocks
	    codeblocks.append('0'+placeholder)
	    #Work out where the placeholder ends
	    tmp=startpoints[0]+len(placeholder)
	    #Add the "sanitized" text up to and including the placeholder
	    sanitizedString = sanitizedString + string[post*(post>=0):tmp]
	    #Set the new post
	    post=tmp
	    #Back to start!
	    continue
        elif startmatches[1] is None and startmatches[2] is None:
    	    #No more blocks, add in the rest of string and be done with it...
    	    sanitizedString = sanitizedString + string[post*(post>=0):]
    	    return (sanitizedString, codeblocks)
        elif startmatches[1] is None:
            inBlock=2
        elif startmatches[2] is None:
            inBlock=1
        else:
	    inBlock = (startpoints[1] < startpoints[2]) + (startpoints[1] > startpoints[2])*2
            if not inBlock:
                inBlock = break_tie(startmatches[1],startmatches[2])
        #Magic to ensure minimum index is 0
        sanitizedString = sanitizedString+string[(post*(post>=0)):startpoints[inBlock]]
        post = startmatches[inBlock].end()
        #Now find the matching end...
        while terminator<post:
            endpoint=scanners[inBlock][1].search()
            #If we run out of terminators before ending this loop, we're done
    	    if endpoint is None:
    	        #Add the unterminated codeblock to the sanitized string
    	        sanitizedString = sanitizedString + string[startpoints[inBlock]:]
    	        return (sanitizedString, codeblocks)
    	    terminator=endpoint.start()
        #We fonud a matching endpoint, add the bit to the appropriate codeblock...
        codeblocks.append(str(inBlock)+string[post:endpoint.start()])
        #Now add in the appropriate placeholder
        sanitizedString = sanitizedString+placeholder
        #Fabulous.  Now we can start again once we update post...
        post = endpoint.end()

def reconstructMath(processedString,codeblocks,inline_delims=["$","$"],equation_delims=["$$","$$"],placeholder="$0$",htmlSafe=False):
    """This is usually the output of sanitizeInput, after having passed the output string through markdown.  The delimiters given to this function should match those used to construct the string to begin with.

     This will output a string containing html suitable to use with mathjax.

     "<" and ">" "&" symbols in math can confuse the html interpreter because they mark the begining and end of definition blocks.  To avoid issues, if htmlSafe is set to True these symbols will be replaced by ascii codes in the math blocks. The downside to this is that if anyone is already doing this, there already niced text might be mangled (I think I've taken steps to make sure it won't but not extensively tested...)"""
    delims=[['',''],inline_delims,equation_delims]
    placeholder_re = re.compile("(?<!\\\\)"+re.escape(placeholder))
    #If we've defined some "new" special characters we'll have to process any escapes of them here
    #Make html substitutions.
    if htmlSafe:
        safeAmp=re.compile("&(?!(?:amp;|lt;|gt;))")
        for i in xrange(len(codeblocks)):
	    codeblocks[i]=safeAmp.sub("&amp;",codeblocks[i])
	    codeblocks[i]=codeblocks[i].replace("<","&lt;")
	    codeblocks[i]=codeblocks[i].replace(">","&gt;")
    #Step through the codeblocks one at a time and replace the next occurance of the placeholder.  Extra placeholders are invalid math blocks and ignored...
    outString=''
    scan = placeholder_re.scanner(processedString)
    post=0
    for i in xrange(len(codeblocks)):
        inBlock=int(codeblocks[i][0])
        match=scan.search()
	if not match:
	    #raise ValueError("More codeblocks given than valid placeholders in text.")
            print("WARNING: More codeblocks given than valid placeholders in text.") 
            continue  # we make this error non-fatal: see https://github.com/sagemathinc/smc/issues/506
	outString=outString+processedString[post:match.start()]+delims[inBlock][0]+codeblocks[i][1:]+delims[inBlock][1]
	post = match.end()
    #Add the rest of the string (if we need to)
    if post<len(processedString):
        outString = outString+processedString[post:]
    return outString

def findBoundaries(string):
    """A depricated function.  Finds the location of string boundaries in a stupid way."""
    last=''
    twod=[]
    oned=[]
    boundary=False
    inoned=False
    intwod=False
    for count,char in enumerate(string):
        if char=="$" and last!='\\':
	    #We just hit a valid $ character!
            if inoned:
    	        oned.append(count)
    	        inoned=False
    	    elif intwod:
    	        if boundary:
    	            twod.append(count)
    	    	    intwod=False
    		    boundary=False
    	        else:
    	            boundary=True
    	    elif boundary:
	        #This means the last character was also a valid $
		twod.append(count)
		intwod=True
		boundary=False
    	    else:
	        #This means the last character was NOT a useable $
    	        boundary=True
        elif boundary:
	    #The last character was a valid $, but this one isn't...
	    #This means the last character was a valid $, but this isn't
	    if inoned:
	        print "THIS SHOULD NEVER HAPPEN!"
	    elif intwod:
	        #ignore it...
		pass
	    else:
	        oned.append(count-1)
		inoned=True
	    boundary=False
        last=char
    #What if we finished on a boundary character?  Actually doesn't matter, but let's include it for completeness
    if boundary:
        if not (inoned or intwod):
	    oned.append(count)
	    inoned=True
    return (oned,twod)
