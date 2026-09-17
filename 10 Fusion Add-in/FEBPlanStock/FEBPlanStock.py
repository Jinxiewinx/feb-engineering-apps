"""FEBPlanStock: the composites app's stack planner, from inside Fusion.

Adds an "FEB" panel to the Design workspace's Utilities tab with one command,
"Plan stock". Select the mold body, optionally the face that is its bottom,
run it, and:

  1. the body is meshed and written as a binary STL in millimetres. With no
     bottom face it is in the root component's frame, Z up, as CS-003 draws
     a mold. With one, the mesh is rotated so that face lies flat at Z = 0
     facing down (febframe.py), because the app slices along Z from the
     lowest point and a split mold is often modelled on its side. The
     matrix goes to the app with the mesh and comes back with the plan, so
     the boxes are drawn in the model's own orientation;
  2. the composites app (feb-composites.web.app) opens in a palette, docked
     on the right, and gets the mesh plus this document's identity;
  3. the page holds the mesh until it is signed in with the rack loaded. If
     `credentials.json` sits beside this file, the add-in signs the page in
     with the shared team account the first time, so nobody types anything;
     the palette then stays signed in on that machine. Without the file the
     member signs in once in the palette, and the mesh opens by itself after.
  4. the member sets density and board mode in the app's own mold modal and
     presses Plan. The app creates the stack plan and the mold record exactly
     as it does in a browser (ids from the shared counter, mesh to Storage)
     and stamps the mold with the Fusion document and who exported it;
  5. the app hands the saved layers back and this add-in draws one box per
     blank in a new component named after the plan id, opacity 0.3, each
     body named "L<n> <thickness>mm S<section>". The mold body is untouched.

Nothing is saved to the document by the add-in. You save.

The message contract with app/fusion.js (JSON strings) is at the top of that
file. This side sends "mold" (stl, body, unit, fusion, and `frame` when a bottom
face was picked), "signin" and "ping"; it receives "loaded",
"state", "mold-held", "mold-received", "mold-failed", "signin-failed",
"plan", "cancel", "pong" and Fusion's own "response".

Facts this code leans on (10 Fusion Add-in/spikes/README.md and the first
Windows install, 2026-09-07):
  - STLExportOptions.unitType reads inches on an inch design and writes mm
    anyway; MeshCalculator (cm, times 10) avoids the question and a temp file.
  - The palette's `adsk` bridge object arrives about a second after the page
    runs, and a sendInfoToHTML before the page reports "loaded" is dropped,
    so the page speaks first and the mesh is queued until it does.
  - Closing the palette with its X HIDES it. The page keeps running and will
    never send "loaded" again, so readiness must not be reset on close. That
    reset is what made every run after the first do nothing on the Windows
    machine.
  - A mesh is kept here until the page confirms it has it ("mold-held" or
    "mold-received"). If nothing comes back within a few seconds the page is
    reloaded and the mesh sent again, so a dead or stale page cannot eat it.
  - Parametric designs take temporary bodies through a base feature; names
    and opacity are set after finishEdit().
"""
import adsk.core, adsk.fusion, traceback, os, json, time, base64, struct, threading
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import febframe

ADDIN_VERSION = "1.1.0"   # keep in step with FEBPlanStock.manifest; tools/package_addin.mjs checks
APP_URL = "https://feb-composites.web.app/?fusion=1#/molds"
PALETTE_ID = "feb_plan_stock_palette"
CMD_ID = "FEB_PlanStock"
PANEL_ID = "FEB_Panel"
WORKSPACE_ID = "FusionSolidEnvironment"
TAB_ID = "ToolsTab"
WATCHDOG_EVENT = "feb_plan_stock_watchdog"
DELIVERY_TIMEOUT_S = 8      # no "loaded"/"mold-held"/"mold-received" in this long: reload the page
HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "febplanstock.log")
CREDENTIALS = os.path.join(HERE, "credentials.json")

_app = None
_ui = None
_handlers = []          # event handlers must outlive the function that made them
_watchdog_event = None
_state = {
    "page_ready": False,    # the page has said "loaded" and has not been replaced since
    "pending": None,        # the last mesh message, kept until the page confirms it holds it
    "confirmed": True,      # the page has taken (or is holding) the pending mesh
    "sent_at": 0.0,
    "signin_tried": False,  # one auto sign-in per page load; a bad password must not loop
    "design": None,
    "frame": None,          # the last model->planning matrix sent, in case the plan comes back without it
    "app_state": {},        # the page's last "state" report
    "warned_no_creds": False,
}


def log(*parts):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + " ".join(str(p) for p in parts) + "\n")
    except Exception:
        pass


def credentials():
    """{"user": "...", "password": "..."} from credentials.json beside the
    add-in, or None. `user` is the app username (or an email). The file is
    never committed; see README.md."""
    try:
        if not os.path.exists(CREDENTIALS):
            return None
        with open(CREDENTIALS, "r", encoding="utf-8") as f:
            d = json.load(f)
        user = str(d.get("user") or d.get("username") or d.get("email") or "").strip()
        pw = str(d.get("password") or "")
        return {"user": user, "password": pw} if user and pw else None
    except Exception:
        log("credentials.json unreadable:", traceback.format_exc())
        return None


# ---------- geometry out ----------

def design_of(doc):
    """The design product even when Manufacture is the active workspace."""
    des = doc.products.itemByProductType("DesignProductType")
    return adsk.fusion.Design.cast(des)


def body_to_stl_mm(body, matrix=None):
    """Binary STL bytes, millimetres. A body picked inside an occurrence
    arrives as a proxy in the root context, so its mesh is already in the
    root frame. `matrix` (febframe, mm) is applied to every point when a
    bottom face was picked."""
    mc = body.meshManager.createMeshCalculator()
    mc.setQuality(adsk.fusion.TriangleMeshQualityOptions.NormalQualityTriangleMesh)
    tm = mc.calculate()
    coords, idx = tm.nodeCoordinatesAsDouble, tm.nodeIndices
    out = bytearray()
    out += (b"FEBPlanStock binary STL, millimetres, " + (b"planning frame" if matrix else b"root frame")).ljust(80, b" ")
    out += struct.pack("<I", tm.triangleCount)
    for t in range(tm.triangleCount):
        pts = []
        for i in (idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]):
            p = (coords[3 * i] * 10.0, coords[3 * i + 1] * 10.0, coords[3 * i + 2] * 10.0)
            pts.append(febframe.apply(matrix, p) if matrix else p)
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = pts
        ux, uy, uz, vx, vy, vz = bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        n = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
        out += struct.pack("<12fH", nx / n, ny / n, nz / n, ax, ay, az, bx, by, bz, cx, cy, cz, 0)
    return bytes(out), tm.triangleCount


def frame_for(body, face):
    """{"matrix": [16], "bottom": {...}} for a picked planar bottom face, or
    None when the model's own Z is the bottom. Everything read from Fusion is
    in centimetres and root context; the matrix is in millimetres."""
    if face is None:
        return None
    ok, nrm = face.evaluator.getNormalAtPoint(face.pointOnFace)
    if not ok:
        raise RuntimeError("Fusion could not give a normal for that face")
    p = face.pointOnFace
    bb = body.boundingBox
    centre = ((bb.minPoint.x + bb.maxPoint.x) / 2, (bb.minPoint.y + bb.maxPoint.y) / 2, (bb.minPoint.z + bb.maxPoint.z) / 2)
    outward = febframe.outward_normal((nrm.x, nrm.y, nrm.z), (p.x, p.y, p.z), centre)
    point_mm = (p.x * 10.0, p.y * 10.0, p.z * 10.0)
    matrix = febframe.frame_matrix(outward, point_mm)
    return {
        "matrix": matrix,
        "bottom": {
            "how": "face",
            "normal": [round(v, 6) for v in outward],
            "point": [round(v, 3) for v in point_mm],
            "area": round(face.area * 100.0, 1),   # cm^2 -> mm^2
        },
    }


def document_identity(doc, body_name):
    """What the mold record stores about where its mesh came from. Every
    field is optional: an unsaved document has no dataFile at all."""
    ident = {"document": doc.name, "body": body_name, "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%S")}
    try:
        u = _app.currentUser
        ident["exportedBy"] = (u.displayName or u.email or "").strip()
    except Exception:
        pass
    try:
        if doc.isSaved and doc.dataFile:
            df = doc.dataFile
            ident.update({
                "urn": df.id, "versionId": df.versionId, "versionNumber": df.versionNumber,
                "webUrl": df.fusionWebURL or "",
            })
            try:
                ident["project"] = df.parentProject.name
            except Exception:
                pass
            try:
                ident["folder"] = df.parentFolder.name
            except Exception:
                pass
    except Exception:
        log("identity:", traceback.format_exc())
    return ident


# ---------- geometry in ----------

def draw_plan(plan):
    """One box per blank, in a new component named after the plan id. The
    layers arrive in the planning frame; a plan made with a bottom face
    carries the matrix that got there, and the boxes are drawn through its
    inverse so they sit over the mold the way it is actually modelled."""
    frame = plan.get("frame") or _state.get("frame")
    matrix = frame.get("matrix") if isinstance(frame, dict) else None
    inv = febframe.invert_rigid(matrix) if febframe.is_matrix(matrix) else None
    des = _state.get("design") or design_of(_app.activeDocument)
    root = des.rootComponent
    name = plan.get("planId") or "Stock plan"
    # Re-running for the same plan replaces the previous component's bodies.
    for occ in root.occurrences:
        if occ.component.name == name:
            occ.deleteMe()
            break
    occ = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    comp = occ.component
    comp.name = name
    tb = adsk.fusion.TemporaryBRepManager.get()
    parametric = des.designType == adsk.fusion.DesignTypes.ParametricDesignType
    base = comp.features.baseFeatures.add() if parametric else None
    if base:
        base.startEdit()
    names = []
    for L in plan.get("layers", []):
        n = int(L.get("index", 0)) + 1
        blanks = L.get("blanks", [])
        for k, b in enumerate(blanks):
            x0, y0, x1, y1 = b["x0"] / 10.0, b["y0"] / 10.0, b["x1"] / 10.0, b["y1"] / 10.0
            z0, z1 = L["z0"] / 10.0, L["z1"] / 10.0
            c = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
            ldir, wdir = (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)
            if inv:
                # The inverse is in mm; the centre is in cm. Rotation is
                # unit-free, so scale only the translation part.
                c = febframe.apply(inv, (c[0] * 10, c[1] * 10, c[2] * 10))
                c = (c[0] / 10, c[1] / 10, c[2] / 10)
                ldir, wdir = febframe.apply_vector(inv, ldir), febframe.apply_vector(inv, wdir)
            centre = adsk.core.Point3D.create(*c)
            obb = adsk.core.OrientedBoundingBox3D.create(
                centre, adsk.core.Vector3D.create(*ldir), adsk.core.Vector3D.create(*wdir),
                x1 - x0, y1 - y0, z1 - z0)
            tmp = tb.createBox(obb)
            if base:
                comp.bRepBodies.add(tmp, base)
            else:
                comp.bRepBodies.add(tmp)
            thk = L.get("thickness", z1 * 10 - z0 * 10)
            suffix = chr(97 + k) if len(blanks) > 1 else ""
            names.append(f"L{n} {thk:g}mm S{int(L.get('section', 0))}{suffix}")
    if base:
        base.finishEdit()
    for i, nm in enumerate(names):
        if i < comp.bRepBodies.count:
            body = comp.bRepBodies.item(i)
            body.name = nm
            body.opacity = 0.3
    log("drew", len(names), "bodies in", name, "(model frame via inverse)" if inv else "(root frame)")
    return len(names)


# ---------- palette ----------

class PaletteIncoming(adsk.core.HTMLEventHandler):
    def notify(self, args):
        try:
            a = adsk.core.HTMLEventArgs.cast(args)
            action, data = a.action, a.data or "{}"
            a.returnData = "ok"
            if action == "loaded":
                # A page that just loaded knows nothing: whatever it was told
                # before is gone, and it may sign in again.
                _state["page_ready"] = True
                _state["signin_tried"] = False
                log("page loaded:", data[:200])
                if _state["pending"] and not _state["confirmed"]:
                    send_pending()
            elif action == "state":
                st = json.loads(data)
                _state["app_state"] = st
                log("page state:", data[:200])
                maybe_sign_in(st)
            elif action == "mold-held":
                _state["confirmed"] = True
                log("page holds the mesh, waiting on", data[:200])
            elif action == "mold-received":
                _state["confirmed"] = True
                _state["pending"] = None
                log("page took the mesh:", data[:200])
            elif action == "mold-failed":
                _state["confirmed"] = True
                _state["pending"] = None
                log("page refused the mesh:", data[:300])
                _ui.messageBox("The app could not take the mesh:\n" + data[:300], "FEB Plan stock")
            elif action == "signin-failed":
                log("sign-in failed:", data[:300])
                _ui.messageBox("The team account in credentials.json could not sign in:\n" + data[:300]
                               + "\n\nSign in in the FEB Composites palette instead; the mold will open once you have.",
                               "FEB Plan stock")
            elif action == "plan":
                plan = json.loads(data)
                n = draw_plan(plan)
                _ui.messageBox(f"{plan.get('planId', 'The plan')} is saved in the app and {n} stock "
                               f"{'body is' if n == 1 else 'bodies are'} drawn over the mold.\n\n"
                               f"Nothing is saved to this document yet.", "FEB Plan stock")
            elif action == "cancel":
                _state["pending"] = None
                _state["confirmed"] = True
            elif action == "pong":
                log("pong:", data[:100])
            elif action == "response":
                log("page response:", data[:200])
            else:
                log("unhandled page message", action, data[:100])
        except Exception:
            log("incoming:", traceback.format_exc())
            _ui.messageBox("Plan stock could not read what the app sent back:\n" + traceback.format_exc(), "FEB Plan stock")


class PaletteClosed(adsk.core.UserInterfaceGeneralEventHandler):
    def notify(self, args):
        # Closing hides the palette; the page keeps running. Nothing to reset.
        log("palette closed by the user")


def palette():
    p = _ui.palettes.itemById(PALETTE_ID)
    if p:
        return p
    _state["page_ready"] = False
    _state["signin_tried"] = False
    p = _ui.palettes.add(PALETTE_ID, "FEB Composites", APP_URL, True, True, True, 460, 760, True)
    p.dockingState = adsk.core.PaletteDockingStates.PaletteDockStateRight
    h = PaletteIncoming(); p.incomingFromHTML.add(h); _handlers.append(h)
    c = PaletteClosed(); p.closed.add(c); _handlers.append(c)
    return p


def reload_palette():
    """Load the app again in the existing palette. The page will say
    "loaded" and the pending mesh goes then."""
    p = palette()
    _state["page_ready"] = False
    _state["signin_tried"] = False
    p.htmlFileURL = APP_URL
    p.isVisible = True
    log("palette reloaded")


def send_pending():
    msg = _state.get("pending")
    if not msg or not _state.get("page_ready"):
        return
    _state["confirmed"] = False
    _state["sent_at"] = time.time()
    msg["addinVersion"] = ADDIN_VERSION
    p = palette()
    p.sendInfoToHTML("mold", json.dumps(msg))
    log("sent mesh", len(msg.get("stl", "")), "chars")
    start_watchdog()


def maybe_sign_in(st):
    """The page says it is not signed in as a member: sign it in with the
    shared account, once per page load, or tell the member what to do."""
    if st.get("ready") or st.get("state") in ("loading", None):
        return
    signed_in_real = st.get("state") == "ready" and not st.get("guest")
    if signed_in_real:
        return   # a member's own account, or pending stock; nothing to do
    if _state["signin_tried"]:
        return
    cred = credentials()
    if cred:
        _state["signin_tried"] = True
        palette().sendInfoToHTML("signin", json.dumps(cred))
        log("sent sign-in for", cred["user"])
    elif _state["pending"] and not _state["warned_no_creds"]:
        _state["warned_no_creds"] = True
        _ui.messageBox("Sign in in the FEB Composites palette on the right; the mold will open there once you have.\n\n"
                       "To skip this on every machine, put the team account in credentials.json beside the add-in "
                       "(see README.md).", "FEB Plan stock")


# ---------- watchdog: a mesh must not vanish into a dead page ----------

class Watchdog(adsk.core.CustomEventHandler):
    def notify(self, args):
        try:
            if _state["pending"] and not _state["confirmed"] and time.time() - _state["sent_at"] >= DELIVERY_TIMEOUT_S - 0.5:
                log("no answer from the page in", DELIVERY_TIMEOUT_S, "s; reloading it")
                reload_palette()
        except Exception:
            log("watchdog:", traceback.format_exc())


def start_watchdog():
    def tick():
        time.sleep(DELIVERY_TIMEOUT_S)
        try:
            _app.fireCustomEvent(WATCHDOG_EVENT, "")
        except Exception:
            pass
    threading.Thread(target=tick, name="feb-plan-stock-watchdog", daemon=True).start()


# ---------- the command ----------

class CommandCreated(adsk.core.CommandCreatedEventHandler):
    def notify(self, args):
        try:
            cmd = adsk.core.CommandCreatedEventArgs.cast(args).command
            cmd.isRepeatable = False
            sel = cmd.commandInputs.addSelectionInput("body", "Mold body", "Select the mold body to plan stock for")
            sel.addSelectionFilter("SolidBodies")
            sel.setSelectionLimits(1, 1)
            # Optional. A mold drawn on its side (a split mold, say) has its
            # real bottom on some face other than the model's XY floor; the
            # planner slices along Z, so it needs telling which face that is.
            bot = cmd.commandInputs.addSelectionInput("bottom", "Bottom face",
                "Optional: the flat face the stack will be glued up from. Leave empty if the model's Z is already up.")
            bot.addSelectionFilter("PlanarFaces")
            bot.setSelectionLimits(0, 1)
            cmd.commandInputs.addTextBoxCommandInput("note", "",
                "The body is exported in millimetres and handed to the composites app, which opens on the right. "
                "Pick a bottom face if the mold is not modelled with its bottom on XY: the mesh is laid flat on "
                "that face for planning and the boxes come back in the model's own orientation. "
                "Set the board density in the app and press Plan.",
                6, True)
            h = CommandExecute(); cmd.execute.add(h); _handlers.append(h)
        except Exception:
            _ui.messageBox("Plan stock failed to open:\n" + traceback.format_exc(), "FEB Plan stock")


class CommandExecute(adsk.core.CommandEventHandler):
    def notify(self, args):
        try:
            cmd = adsk.core.CommandEventArgs.cast(args).command
            sel = adsk.core.SelectionCommandInput.cast(cmd.commandInputs.itemById("body"))
            body = adsk.fusion.BRepBody.cast(sel.selection(0).entity)
            bsel = adsk.core.SelectionCommandInput.cast(cmd.commandInputs.itemById("bottom"))
            face = adsk.fusion.BRepFace.cast(bsel.selection(0).entity) if bsel and bsel.selectionCount else None
            doc = _app.activeDocument
            _state["design"] = design_of(doc)
            frame = frame_for(body, face)
            _state["frame"] = frame
            stl, tris = body_to_stl_mm(body, frame["matrix"] if frame else None)
            ident = document_identity(doc, body.name)
            msg = {"stl": base64.b64encode(stl).decode("ascii"), "body": body.name, "unit": "mm", "fusion": ident}
            if frame:
                msg["frame"] = frame
            _state["pending"] = msg
            _state["confirmed"] = False
            log("exported", body.name, tris, "triangles,", len(stl), "bytes,",
                ("bottom face normal %s" % (frame["bottom"]["normal"],)) if frame else "model Z is up")
            p = palette()
            p.isVisible = True
            if _state["page_ready"]:
                send_pending()
            else:
                # The page announces itself with "loaded" and the mesh goes
                # then. If it never does, the watchdog reloads it.
                _state["sent_at"] = time.time()
                start_watchdog()
        except Exception:
            _ui.messageBox("Plan stock failed:\n" + traceback.format_exc(), "FEB Plan stock")


def run(context):
    global _app, _ui, _watchdog_event
    try:
        _app = adsk.core.Application.get()
        _ui = _app.userInterface
        cmd = _ui.commandDefinitions.itemById(CMD_ID)
        if not cmd:
            cmd = _ui.commandDefinitions.addButtonDefinition(
                CMD_ID, "Plan stock",
                "Export the selected mold body to the composites app's stack planner and draw the tooling-board layers over it.",
                os.path.join(HERE, "resources"))
        h = CommandCreated(); cmd.commandCreated.add(h); _handlers.append(h)
        ws = _ui.workspaces.itemById(WORKSPACE_ID)
        tab = ws.toolbarTabs.itemById(TAB_ID) or ws.toolbarTabs.item(0)
        panel = tab.toolbarPanels.itemById(PANEL_ID) or tab.toolbarPanels.add(PANEL_ID, "FEB")
        if not panel.controls.itemById(CMD_ID):
            ctl = panel.controls.addCommand(cmd)
            ctl.isPromoted = True
            ctl.isPromotedByDefault = True
        try:
            _app.unregisterCustomEvent(WATCHDOG_EVENT)
        except Exception:
            pass
        _watchdog_event = _app.registerCustomEvent(WATCHDOG_EVENT)
        w = Watchdog(); _watchdog_event.add(w); _handlers.append(w)
        log("FEBPlanStock", ADDIN_VERSION, "loaded; Fusion", _app.version,
            "; credentials.json", "present" if credentials() else "absent")
    except Exception:
        if _ui:
            _ui.messageBox("FEBPlanStock failed to load:\n" + traceback.format_exc(), "FEB Plan stock")


def stop(context):
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        try:
            app.unregisterCustomEvent(WATCHDOG_EVENT)
        except Exception:
            pass
        p = ui.palettes.itemById(PALETTE_ID)
        if p:
            p.deleteMe()
        ws = ui.workspaces.itemById(WORKSPACE_ID)
        for tab in ws.toolbarTabs:
            panel = tab.toolbarPanels.itemById(PANEL_ID)
            if panel:
                ctl = panel.controls.itemById(CMD_ID)
                if ctl:
                    ctl.deleteMe()
                panel.deleteMe()
        cmd = ui.commandDefinitions.itemById(CMD_ID)
        if cmd:
            cmd.deleteMe()
    except Exception:
        log("stop:", traceback.format_exc())
