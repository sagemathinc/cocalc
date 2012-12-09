######
# Test client for worksheet/cell code
######
#

{Cell} = require("cell")
{to_json} = require("misc")

{diff}   = require("misc_page")

testbox = $(".salvus-worksheet2-testbox")

c = new Cell(element:$("<div>"))

c.on "change", (m) ->
    console.log("change: #{to_json(m)}")

testbox.append(c.element)

d = $("<div>")
testbox.append(d)
d.salvus_cell()

c2 = d.data('cell')