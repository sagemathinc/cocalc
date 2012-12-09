######
# Test client for worksheet/cell code
######
#

{Cell} = require("cell")

testbox = $(".salvus-worksheet2-testbox")

c = new Cell(element:$("<div>"), input:"Hello salvus")

testbox.append(c.element)

d = $("<div>")
testbox.append(d)
d.salvus_cell(input:"Hello 2")

