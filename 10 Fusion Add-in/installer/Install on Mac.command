#!/bin/bash
# Install on Mac.command — put FEBPlanStock into Fusion's add-ins folder.
#
# Double-click this file. It copies the FEBPlanStock folder sitting next to it
# into Fusion's per-user AddIns directory, keeping any credentials.json that is
# already installed. Nothing else on the machine is touched.
#
# Everything is quoted: both the source path and the target contain spaces.

set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/FEBPlanStock"
ADDINS="$HOME/Library/Application Support/Autodesk/Autodesk Fusion 360/API/AddIns"
DEST="$ADDINS/FEBPlanStock"

echo
echo "FEB Composites — Plan stock add-in for Fusion"
echo "---------------------------------------------"
echo

fail() { echo; echo "FAILED: $1"; echo; echo "Press return to close."; read -r _; exit 1; }

[ -d "$SRC" ] || fail "no FEBPlanStock folder next to this installer.
Unzip the whole download first, then run the installer from inside it."
[ -f "$SRC/FEBPlanStock.manifest" ] || fail "the FEBPlanStock folder next to this installer is not the add-in."

VER="$(sed -n 's/.*"version"[^"]*"\([^"]*\)".*/\1/p' "$SRC/FEBPlanStock.manifest" | head -1)"
[ -n "$VER" ] || VER="unknown"

if pgrep -f "Autodesk Fusion" >/dev/null 2>&1; then
  echo "Fusion is running. The add-in will be installed anyway, but you must"
  echo "quit and reopen Fusion before it loads."
  echo
fi

mkdir -p "$ADDINS" || fail "could not create $ADDINS"

# Keep the shared team account across an update. Replacing the folder wipes it,
# which is how the old hand-copy instructions used to lose it.
KEPT=""
TMPCRED="$(mktemp -d)"
if [ -f "$DEST/credentials.json" ]; then
  cp "$DEST/credentials.json" "$TMPCRED/credentials.json" && KEPT="yes"
fi

if [ -d "$DEST" ]; then
  echo "Replacing the add-in that is already installed."
  rm -rf "$DEST" || fail "could not remove the old $DEST"
else
  echo "Installing the add-in."
fi

cp -R "$SRC" "$DEST" || fail "could not copy into $ADDINS"

if [ -n "$KEPT" ]; then
  cp "$TMPCRED/credentials.json" "$DEST/credentials.json" && echo "Kept the credentials.json you already had."
fi
rm -rf "$TMPCRED"

# A zip downloaded in a browser quarantines every file inside it, and Fusion
# will not run quarantined Python.
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null

echo
echo "Installed FEBPlanStock $VER into"
echo "  $DEST"
echo
echo "Now do this:"
echo "  1. Quit Fusion completely and open it again."
echo "     (Or, without restarting: Utilities tab > Add-Ins > Add-Ins tab >"
echo "      FEBPlanStock > Run.)"
echo "  2. Open a mold design. On the Utilities tab you will see a FEB panel"
echo "     with a Plan stock button."
echo "  3. Select the mold body, press Plan stock, and sign in to the"
echo "     composites app in the panel that opens. It remembers you after that."
echo
echo "Press return to close."
read -r _
