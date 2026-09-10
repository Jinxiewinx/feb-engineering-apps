#!/usr/bin/env python3
"""Tests for 10 Fusion Add-in/FEBPlanStock/febframe.py, the bottom-face
frame math, run without Fusion:  python3 tools/test_fusion_frame.py

The JS side (slicer.js invertRigid, exercised in test_slicer.mjs) must agree
with this module on the same fixed matrix; the +X case below is that matrix."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "10 Fusion Add-in", "FEBPlanStock"))
import febframe as F

passed = failed = 0
def t(name, fn):
    global passed, failed
    try:
        fn(); passed += 1; print("  ok ", name)
    except Exception as e:
        failed += 1; print("FAIL ", name, "—", e)

def near(a, b, tol=1e-9):
    return all(abs(x - y) <= tol for x, y in zip(a, b))

def t_outward():
    # Surface normal pointing INTO the body (toward its centre) is flipped.
    n = F.outward_normal((0, 0, 1), (0, 0, 0), (0, 0, 50))
    assert near(n, (0, 0, -1)), n
    # Already outward: kept.
    n = F.outward_normal((0, 0, -2), (0, 0, 0), (0, 0, 50))
    assert near(n, (0, 0, -1)), n
t("the outward normal points away from the body's centre, whatever sign Fusion gave", t_outward)

def t_plus_x():
    # A mold on its side whose bottom faces +X: rotation about Y by +90deg.
    m = F.frame_matrix((1, 0, 0), (0, 0, 0))
    assert near(m, [0, 0, 1, 0,  0, 1, 0, 0,  -1, 0, 0, 0,  0, 0, 0, 1]), m
    assert near(F.apply_vector(m, (1, 0, 0)), (0, 0, -1)), "the bottom's normal now points down"
    # A point 100mm INTO the body from the face (toward -X) ends up at z = +100.
    assert near(F.apply(m, (-100, 7, 3)), (3, 7, 100)), F.apply(m, (-100, 7, 3))
t("a bottom facing +X becomes a bottom facing -Z, with the body above it", t_plus_x)

def t_degenerate():
    assert near(F.frame_matrix((0, 0, -1), (0, 0, 0)), [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]), "already down: identity"
    m = F.frame_matrix((0, 0, 1), (0, 0, 0))
    assert near(F.apply_vector(m, (0, 0, 1)), (0, 0, -1)), "straight up: a half turn"
    assert near(F.apply(m, (1, 2, 3)), (1, -2, -3)), F.apply(m, (1, 2, 3))
t("the two degenerate normals (already down, straight up) are handled", t_degenerate)

def t_translation():
    # The picked point lands on the origin; the face lies on z = 0.
    m = F.frame_matrix((0, 1, 0), (10, 20, 30))
    assert near(F.apply(m, (10, 20, 30)), (0, 0, 0)), F.apply(m, (10, 20, 30))
    assert abs(F.apply(m, (99, 20, -5))[2]) < 1e-9, "another point on the face is still at z = 0"
    assert F.apply(m, (10, 0, 30))[2] > 19, "a point 20mm inside the body is 20mm up"
t("the picked face lands flat on Z = 0 with the picked point at the origin", t_translation)

def t_inverse():
    import math
    n = (math.cos(0.7) * math.cos(0.3), math.sin(0.7) * math.cos(0.3), math.sin(0.3))
    m = F.frame_matrix(n, (12.5, -3, 8))
    inv = F.invert_rigid(m)
    for p in [(0, 0, 0), (100, 50, 25), (-7, 3.5, 900)]:
        assert near(F.apply(inv, F.apply(m, p)), p, 1e-6), p
    # Rotation part is orthonormal (so the inverse-by-transpose is legitimate).
    R = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]]
    for i in range(3):
        for j in range(3):
            d = sum(R[i][k] * R[j][k] for k in range(3))
            assert abs(d - (1 if i == j else 0)) < 1e-9, (i, j, d)
t("invert_rigid undoes any frame, and the rotation is a proper rotation", t_inverse)

def t_is_matrix():
    assert F.is_matrix([0.0] * 16) and not F.is_matrix([0.0] * 3) and not F.is_matrix(None) and not F.is_matrix(["a"] * 16)
    assert not F.is_matrix([float("nan")] * 16)
t("is_matrix accepts 16 finite numbers and nothing else", t_is_matrix)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
