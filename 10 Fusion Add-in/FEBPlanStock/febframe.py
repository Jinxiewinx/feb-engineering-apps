"""febframe: the planning frame, as plain arithmetic.

The composites app slices along Z from the mesh's lowest point, so it wants
the mold's bottom face flat and facing down. A mold is not always modelled
that way: a split mold is often drawn rotated 90 degrees, with its parting
face on a side. So Plan stock takes an optional bottom face, and this module
builds the rigid transform that lays that face flat at Z = 0 facing -Z.

Kept free of the `adsk` modules on purpose, so `tools/test_fusion_frame.py`
can run it under plain python3. FEBPlanStock.py hands in plain tuples.

Conventions, shared with app/fusion.js and app/slicer.js:
  - a matrix is 16 numbers, row-major, a 4x4 with the translation in the
    last column, applied to column vectors: p' = M p;
  - everything is in MILLIMETRES by the time it reaches a matrix;
  - `matrix` maps the MODEL frame to the PLANNING frame. The app stores it on
    the plan and hands it back with the layers; draw_plan inverts it.
"""


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _unit(v):
    n = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) ** 0.5
    if n == 0:
        raise ValueError("zero-length normal")
    return (v[0] / n, v[1] / n, v[2] / n)


def outward_normal(normal, point_on_face, body_centre):
    """The face normal pointing AWAY from the body. Fusion's face evaluator
    gives the surface normal, whose sign depends on the face's parameter
    orientation; rather than reason about isParamReversed, look at which side
    the body's centre is on. A bottom face sits on the boundary of the body's
    box, so the centre is always on its inner side."""
    n = _unit(normal)
    to_centre = (body_centre[0] - point_on_face[0], body_centre[1] - point_on_face[1], body_centre[2] - point_on_face[2])
    if _dot(n, to_centre) > 0:
        n = (-n[0], -n[1], -n[2])
    return n


def rotation_to_down(n):
    """3x3 rotation (row-major, nested tuples) taking unit vector n onto
    (0, 0, -1). Rodrigues, with the two degenerate cases handled: n already
    down is the identity, and n straight up is a half turn about X."""
    n = _unit(n)
    d = (0.0, 0.0, -1.0)
    c = _dot(n, d)
    if c > 1 - 1e-9:
        return ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))
    if c < -1 + 1e-9:
        return ((1.0, 0.0, 0.0), (0.0, -1.0, 0.0), (0.0, 0.0, -1.0))
    v = _cross(n, d)
    k = 1.0 / (1.0 + c)
    vx, vy, vz = v
    # I + [v]x + [v]x^2 * k
    return (
        (1 - (vy * vy + vz * vz) * k, -vz + vx * vy * k, vy + vx * vz * k),
        (vz + vx * vy * k, 1 - (vx * vx + vz * vz) * k, -vx + vy * vz * k),
        (-vy + vx * vz * k, vx + vy * vz * k, 1 - (vx * vx + vy * vy) * k),
    )


def frame_matrix(outward, point_on_face_mm):
    """The 16-number model->planning matrix for a bottom face with the given
    outward normal and a point on it (mm). The face lands on Z = 0 with the
    body above it, and the point lands on the origin."""
    R = rotation_to_down(outward)
    p = point_on_face_mm
    t = tuple(-(R[i][0] * p[0] + R[i][1] * p[1] + R[i][2] * p[2]) for i in range(3))
    return [
        R[0][0], R[0][1], R[0][2], t[0],
        R[1][0], R[1][1], R[1][2], t[1],
        R[2][0], R[2][1], R[2][2], t[2],
        0.0, 0.0, 0.0, 1.0,
    ]


def apply(m, p):
    """M p for a point (any units, as long as they match the matrix)."""
    x, y, z = p
    return (
        m[0] * x + m[1] * y + m[2] * z + m[3],
        m[4] * x + m[5] * y + m[6] * z + m[7],
        m[8] * x + m[9] * y + m[10] * z + m[11],
    )


def apply_vector(m, v):
    """M v for a direction: rotation only, no translation."""
    x, y, z = v
    return (
        m[0] * x + m[1] * y + m[2] * z,
        m[4] * x + m[5] * y + m[6] * z,
        m[8] * x + m[9] * y + m[10] * z,
    )


def invert_rigid(m):
    """Inverse of a rotation-plus-translation matrix: transpose the rotation,
    negate and rotate the translation. Not a general inverse; a frame matrix
    is never anything else."""
    R = ((m[0], m[1], m[2]), (m[4], m[5], m[6]), (m[8], m[9], m[10]))
    t = (m[3], m[7], m[11])
    Rt = ((R[0][0], R[1][0], R[2][0]), (R[0][1], R[1][1], R[2][1]), (R[0][2], R[1][2], R[2][2]))
    ti = tuple(-(Rt[i][0] * t[0] + Rt[i][1] * t[1] + Rt[i][2] * t[2]) for i in range(3))
    return [
        Rt[0][0], Rt[0][1], Rt[0][2], ti[0],
        Rt[1][0], Rt[1][1], Rt[1][2], ti[1],
        Rt[2][0], Rt[2][1], Rt[2][2], ti[2],
        0.0, 0.0, 0.0, 1.0,
    ]


def is_matrix(m):
    try:
        return len(m) == 16 and all(isinstance(v, (int, float)) and v == v for v in m)
    except Exception:
        return False
