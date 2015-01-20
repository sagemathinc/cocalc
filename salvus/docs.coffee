###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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


###
Abstract documents in Salvus -- no realization in a DOM, hence usable from Node.JS.
###

diffsync = require('diffsync')
misc     = require('misc')
{defaults, required} = misc

class Cell
    constructor: (opts) ->
        opts = defaults opts,
            id     : required
            note   : ''
            input  : ''
            hidden : []
            output : []
        @_id    = opts.id
        @note   = opts.note
        @input  = opts.input
        @output = opts.output
        @hidden = opts.hidden

    id: () =>
        return @_id

    diff: (version1) =>
        # version1 = something of this same class (a Cell object) *or* a page/cell.Cell object

        # Given two cells -- this one (version0) and version1, compute a JSON-able
        # object that encodes a patch that transforms this cell to version1.
        # This purely involves input -- the output part of the cell is ignored.
        # Special case: if the cells are the same, return the empty list.

        note0  = @note
        input0 = @input
        hide0  = @hidden

        note1  = version1.note()
        input1 = version1.input()
        hide1  = version1.hidden()

        # super-common special case
        if note0 == note1 and input0 == input1 and hide0 == hide1
            return []

        # Note patch
        note_patch = diffsync.dmp.patch_make(note0, note1)
        # Input patch
        input_patch= diffsync.dmp.patch_make(input0, input1)
        # Components patch (todo: this comp can prob be optimized a lot, e.g., starting with replacing c below (the string) with a number or character)
        component_patch = []
        # First: removed components
        for c in hide0
            if c not in hide1
                component_patch.push([c,-1])
        # Next: added components
        for c in hide1
            if c not in hide0
                component_patch.push([c,+1])

        # The cell patch is the combination of the above three patches.
        # These patches will *never* be stored longterm or used between
        # different versions, so we use an array instead of an object.
        if note_patch.length == 0 and input_patch.length == 0 and component_patch.length == 0
            return []
        else
            return [note_patch, input_patch, component_patch]

    patch: (patch) =>
        # Apply a patch to this cell, transforming it into a new cell.
        # The patch must be in exactly the format returned by diff above.
        note_patch      = patch[0]
        input_patch     = patch[1]
        component_patch = patch[2]

        if note_patch.length > 0
            @note = diffsync.dmp.patch_apply(note_patch, @note)[0]

        if input_patch.length > 0
            @input = diffsync.dmp.patch_apply(input_patch, input)[0]

        for x in component_patch
            comp   = x[0]
            action = x[1]
            if action == -1
                # change component from hidden to shown
                i = @hidden.indexOf(comp)
                if i != -1
                    @hidden.splice(i, 1)
            else
                # change component from shown to hidden
                if comp not in hidden
                    @hidden.push(comp)

# A worksheet is a list of cells, a title, and a description.
class Worksheet
    constructor: (opts) ->
        opts = defaults opts,
            title : ''
            description : ''
            cells : []
        @title = opts.title
        @description = opts.description
        @_cells = opts.cells

    cells: () =>
        return @_cells

    cell: (id) =>
        if @_cells_by_id?
            return @_cells_by_id[id]
        @_cells_by_id = {}
        for c in @cells
            @_cells_by_id[c.id()] = c
        return @_cells_by_id[id]

    diff: (version1) =>
        # version1 = something of this same class (an Worksheet doc) *or* a page/worksheet.Worksheet

        # Given two worksheets -- this one (version0) and version1, compute a JSON-able
        # object that encodes a patch that transforms this worksheet to version1
        # (at least on the level of input -- output is ignored).
        # The patch is the empty list exactly when there is nothing to be done.

        # There are two levels to diff'ing, diffing the ordered list of uuid's of cells,
        # then diffing the cells themselves.
        cells0 = @cells
        cells1 = version1.cells

        #########################################################
        # Our diff algorithm does the following:
        #   * Create a patch cell_list_patch that transforms the ordered list of uuid's for cells0 to the ordered list for cells1.
        #   * For each new cell in cells1 (i.e., call not in cells0) define a patch that simply adds all the content of that cell.
        #   * For each cell in cells1 that is also in cells0, compute the patch transforming it.
        #########################################################

        # To construct the cell_list_patch, we convert the cell uuid's, which we assume are distinct, to unicode characters.
        # We then apply the dmp library to compute a patch that transforms one string to the other.
        # When we later apply it, we'll eliminate duplicate cells.
        string_mapping = new misc.StringCharMapping()
        cells0_string  = string_mapping.to_string(c.id() for c in cells0)
        cells1_string  = string_mapping.to_string(c.id() for c in cells1)

        p = diffsync.dmp.patch_make(cells0_string, cells1_string)
        if p.length == 0
            cell_list_patch = []
        else
            # Take only the part of the mapping that actually appears in the patch
            to_string = {}
            for d in p
                for x in d.diffs
                    for s in x[1]
                        to_string[s] = string_mapping.to_string(s)
            cell_list_patch= [p, to_string]

        # Now, for each cell that remains, we may have a patch.   The cell_patches object will
        # be a mapping from cell id's to cell patches.
        for cell1 in cells1
            id = cell1.id()
            cell0 = @cell(id)
            if cell0?
                p = cell0.diff(cell1)
                if p.length > 0
                    cell_patches[id] = p

        v = []
        if cell_list_patch.length == 0 and misc.len(cell_patches) == 0
            return []
        else
            return [cell_list_patch, cell_patches]

    patch: (patch) =>
        # Apply a patch (as defined above) to this worksheet, transforming it (and all cells init) in place into a new worksheet.
        if patch.length == 0
            # easy common special case?
            return
        cell_list_patch = patch[0]
        cell_patches    = patch[1]

        # There are two things to do:
        #   (1) compute the new ordered cell list, which may involve creating and deleting cells, and reordering them.
        #   (2) for each remaining cell, apply the corresponding cell patch

        # Stage 1: cell creation/deletion/reordering
        if cell_list_patch.length > 0
            patch = cell_list_patch[0]
            string_mapping = new misc.StringCharMapping(cell_list_patch[1])
            # Convert our current list of cells to a string using the mapping,
            # apply the patch to that string, then eliminate duplicates.
            s = string_mapping.to_string(c.id() for c in @cells())
            t = diffsync.dmp.patch_apply(patch, s)[0]
            t = misc.uniquify_string(t)  # eliminate duplicates
            if s != t
                # The patch modified our cell list.  Now we have to do something about it.
                new_cells = []
                for id in string_mapping.to_array(t)
                    cell = @cell(id)
                    if not cell?
                        # New cell
                        cell = new Cell(id:id)
                    new_cells.append(cell)
                @_cells = new_cells
                delete @_cells_by_id

        # Stage 2: applying patches to cells
        for id, patch of cell_patches
            cell = @cell(id)
            if cell?  # only bother if the cell still exists
                cell.patch(patch)


