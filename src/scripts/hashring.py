###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
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


"""
Based on https://pypi.python.org/pypi/hash_ring (copyright: 2008 by Amir Salihefendic; license: BSD)

I (William Stein) rewrote all the documentation, fixed some trivial bugs,
more compatible with node-hashring (e.g., vnode support), etc.  BSD license.

Example:

    import hashring
    r = hashring.HashRing({'10.1.1.4':{'vnodes':256}, '10.1.2.4':{'vnodes':128}, '10.1.3.4':{'vnodes':128}})
    r.range('foo')
    ['10.1.1.4', '10.1.3.4', '10.1.2.4']
"""

import math
import sys
from bisect import bisect

import hashlib
md5_constructor = hashlib.md5

class HashRing(object):

    def __init__(self, nodes=None, weights=1, vnodes=40, replicas=4):
        """
        `nodes` is a list of objects that have a proper __str__ representation.
        `weights` is dictionary that sets weights to the nodes.  The default
        weight is that all nodes are equal.
        """
        self.ring = dict()
        self._sorted_keys = []

        if isinstance(nodes, dict):
            weights = dict([(n, nodes[n].get('weight',weights)) for n in nodes])
            vnodes  = dict([(n, nodes[n].get('vnodes',vnodes)) for n in nodes])
            nodes = nodes.keys()

        self.nodes = nodes

        if not isinstance(weights, dict):
            weights = dict([(n,weights) for n in nodes])
        else:
            for n in nodes:
                if n not in weights:
                    weights[n] = 1
        self.weights = weights

        self.replicas = replicas

        if not isinstance(vnodes, dict):
            vnodes = dict([(n,vnodes) for n in nodes])
        else:
            for n in nodes:
                if n not in vnodes:
                    vnodes[n] = 40

        self.vnodes = vnodes

        self._generate_circle()

    def _generate_circle(self):
        """
        Generates the circle.
        """
        total_weight = 0
        for node in self.nodes:
            total_weight += self.weights.get(node, 1)

        for node in self.nodes:
            weight = self.weights[node]
            factor = (self.vnodes[node]*len(self.nodes)*weight) // total_weight
            for j in xrange(0, int(factor)):
                b_key = self._hash_digest('%s-%s'%(node, j))
                for i in xrange(0, self.replicas):
                    key = self._hash_val(b_key, lambda x: x+i*4)
                    self.ring[key] = node
                    self._sorted_keys.append(key)

        self._sorted_keys.sort()

    def get_node(self, string_key):
        """
        Given a string key, return some corresponding node in the hash ring.

        If the hash ring is empty, return `None`.
        """
        pos = self.get_node_pos(string_key)
        if pos is None:
            return None
        return self.ring[ self._sorted_keys[pos] ]


    def range(self, key, size=None, distinct=True):
        if size is None:
            return list(self.iterate_nodes(key, distinct=distinct))
        v = []
        for k in self.iterate_nodes(key, distinct=distinct):
            v.append(k)
            if len(v) >= size:
                return v
        return v

    def __getitem__(self, string_key):
        """
        Given a string key, return node that hold the key.
        """
        return self.range(string_key)

    def get_node_pos(self, string_key):
        """
        Given a string key, return a corresponding node in the hash ring
        along with it's position in the ring.

        If the hash ring is empty, `None` is returned.
        """
        if not self.ring:
            return None

        key = self.gen_key(string_key)

        nodes = self._sorted_keys
        pos = bisect(nodes, key)

        if pos == len(nodes):
            return 0
        else:
            return pos

    def iterate_nodes(self, string_key, distinct=True):
        """
        Given a string key, return iterator over all nodes that hold the key.

        The generator iterates one time through the ring
        starting at the correct position.

        if `distinct` is set, then the nodes returned will be unique,
        i.e. no virtual copies will be returned.
        """
        if not self.ring:
            yield None, None

        returned_values = set()
        def distinct_filter(value):
            if str(value) not in returned_values:
                returned_values.add(str(value))
                return value

        pos = self.get_node_pos(string_key)
        for key in self._sorted_keys[pos:]:
            val = distinct_filter(self.ring[key])
            if val:
                yield val

        # wrap around if necessary.
        for i, key in enumerate(self._sorted_keys):
            if i < pos:
                val = distinct_filter(self.ring[key])
                if val:
                    yield val

    def gen_key(self, key):
        """
        Given a string key return a long value, which
        represents a place on the hash ring.

        md5 is currently used because it mixes well.
        """
        b_key = self._hash_digest(key)
        return self._hash_val(b_key, lambda x: x)

    def _hash_val(self, b_key, entry_fn):
        return (( b_key[entry_fn(3)] << 24)
                |(b_key[entry_fn(2)] << 16)
                |(b_key[entry_fn(1)] << 8)
                | b_key[entry_fn(0)] )

    def _hash_digest(self, key):
        m = md5_constructor()
        m.update(key)
        return map(ord, m.digest())