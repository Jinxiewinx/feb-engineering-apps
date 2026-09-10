# Fusion's built-in MCP server

Found 2026-09-04. Fusion 2702.1.58 ships its own MCP server (the Neutron
library `NsMCP10.dylib`), so no third-party add-in is needed to drive a live
Fusion session from Claude Code. The community "Fusion MCP" projects on
GitHub are separate add-ins with their own ports and do not apply.

## Connecting

1. In Fusion, Preferences → General → "Fusion MCP Server (runs locally on this
   device)". The option is `MCPServerEnabled` in
   `~/Library/Application Support/Autodesk/Neutron Platform/Options/NMachineSpecificOptions.xml`.
2. **Restart Fusion.** The option is read at launch; turning it on in a running
   session starts nothing.
3. The server listens on `127.0.0.1:27182` (the digits of pi, so it looks
   deliberate rather than dynamic; the library can fall back to a dynamic port
   if that one is taken). Routes are `/health` and `/mcp` (streamable HTTP,
   JSON-RPC). `tools/find_fusion_mcp.py` finds the port among Fusion's
   listening sockets and runs the `initialize` handshake.
4. Register it once, at user scope:

```bash
claude mcp add --transport http fusion http://127.0.0.1:27182/mcp --scope user
```

A Claude Code session started before the registration does not see the tools;
start a new one. The server reports protocol `2024-11-05`, name
"MCP Server Adapter" 1.0.0, no resources.

## From a session whose client never connected

The registered `fusion` server only exists once Fusion is running, so a
Claude Code session started before Fusion reports the server as failed and
cannot reconnect mid-session. `tools/fusion_mcp.py` is the way round it:
plain HTTP JSON-RPC against `/mcp` with no MCP client at all.

```bash
python3 "10 Fusion Add-in/tools/fusion_mcp.py" tools           # list tools
python3 "10 Fusion Add-in/tools/fusion_mcp.py" run script.py   # run a Fusion script
```

`script.py` defines `run(_context)`; whatever it prints comes back. This is
how the bottom-face hand-off was verified live on 2026-09-09: one script
built a side-lying block in a scratch document and exported it through the
installed add-in's `frame_for` and `body_to_stl_mm`, node planned the STL
with the real slicer, and a second script fed the layers to `draw_plan`,
measured the drawn boxes (standing on the picked face, to the millimetre)
and closed the scratch document unsaved.

## The three tools

- `fusion_mcp_execute` with `featureType: "script"` runs a Python script inside
  Fusion against the full API. The script defines `def run(_context: str)`;
  `print()` output comes back as the tool result, exceptions come back as
  errors. It also opens, closes and saves documents by file id.
- `fusion_mcp_read` lists projects in the active hub, searches documents by
  name, lists open and recent documents, searches the API documentation, and
  returns a PNG screenshot of the viewport from a chosen direction.
- `fusion_mcp_update` is undo and redo.

## What it means for the add-in study

The `script` tool is the Fusion API with no install step, so spikes S1, S2,
S3 and S6 in `FEASIBILITY-PLAN.md` can run from a session on this Mac against
the live design, and a member's Windows machine only has to repeat them. It
does not replace the add-in: members will not run Claude Code at the shop PC,
and the palette (S4) and the threaded REST client (S5) still need real add-in
code. What it changes is the cost of finding out.

Smoke test on 2026-09-04: Fusion 2702.1.58, bundled Python 3.14.0, macOS 26.3
arm64, hub "FEB Aero", a read-only script listing the active document, its
units, bodies and data-file identity ran and returned in under a second.
