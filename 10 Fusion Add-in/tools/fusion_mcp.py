#!/usr/bin/env python3
"""Talk to Fusion's built-in MCP server over plain HTTP, for a Claude Code
session whose MCP client could not connect at startup (the server only
exists once Fusion is up). Usage:

  python3 fusion_mcp.py tools                 # list the tools and schemas
  python3 fusion_mcp.py run script.py         # run a Fusion script (def run(_context))
  python3 fusion_mcp.py call <tool> '<json>'  # any tool, raw arguments

Read-only unless the script you hand it is not."""
import json, sys, urllib.request

URL = "http://127.0.0.1:27182/mcp"
HDR = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
_id = [0]
_session = {}


def rpc(method, params=None):
    _id[0] += 1
    body = json.dumps({"jsonrpc": "2.0", "id": _id[0], "method": method, "params": params or {}}).encode()
    hdr = dict(HDR)
    if _session.get("id"):
        hdr["Mcp-Session-Id"] = _session["id"]
    req = urllib.request.Request(URL, data=body, headers=hdr, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        sid = resp.headers.get("Mcp-Session-Id")
        if sid:
            _session["id"] = sid
        raw = resp.read().decode("utf-8", "replace")
    # Streamable HTTP may answer as SSE; take the last data: line.
    if raw.lstrip().startswith("event:") or "\ndata:" in raw or raw.startswith("data:"):
        datas = [ln[5:].strip() for ln in raw.splitlines() if ln.startswith("data:")]
        raw = datas[-1] if datas else raw
    msg = json.loads(raw)
    if "error" in msg:
        raise RuntimeError(json.dumps(msg["error"]))
    return msg.get("result")


def init():
    rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "feb-fusion-mcp", "version": "1"}})
    try:
        _id[0] += 1
        body = json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}).encode()
        hdr = dict(HDR)
        if _session.get("id"):
            hdr["Mcp-Session-Id"] = _session["id"]
        urllib.request.urlopen(urllib.request.Request(URL, data=body, headers=hdr, method="POST"), timeout=10).read()
    except Exception:
        pass


def call(tool, args):
    r = rpc("tools/call", {"name": tool, "arguments": args})
    out = []
    for c in (r or {}).get("content", []):
        if c.get("type") == "text":
            out.append(c.get("text", ""))
        else:
            out.append(f"<{c.get('type')}>")
    if (r or {}).get("isError"):
        out.insert(0, "TOOL ERROR")
    return "\n".join(out)


if __name__ == "__main__":
    init()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "tools"
    if cmd == "tools":
        for t in rpc("tools/list").get("tools", []):
            print(t["name"], "-", (t.get("description") or "")[:200].replace("\n", " "))
            print("   ", json.dumps(t.get("inputSchema", {}))[:900])
    elif cmd == "run":
        src = open(sys.argv[2], encoding="utf-8").read()
        print(call("fusion_mcp_execute", {"featureType": "script", "object": {"script": src}}))
    elif cmd == "call":
        print(call(sys.argv[2], json.loads(sys.argv[3] if len(sys.argv) > 3 else "{}")))
