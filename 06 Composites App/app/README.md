# FEB Composites, hosted app

Live at https://feb-composites.web.app. It's a tabbed workspace for everything
composites tracks over a season, not just work orders. Everyone signs in with
email and password, and the Firestore database is shared, updating live for the
whole team. Set your photo by clicking your avatar at top right.

This file is the app's manual. In order: [the tabs](#the-tabs), then
[labels](#labels) and [scanning](#scanning), [which lots went
in](#which-lots-went-in), [getting around](#getting-around), [how access
works](#how-access-works), [what a buy-off is](#what-a-buy-off-is-and-isnt),
[files and photos](#files-photos-and-watchers), [project
setup](#one-time-project-setup) for standing the Firebase project up again,
[day-to-day care](#day-to-day) and [cost](#cost).

If you are the next lead, read `../../HANDOFF.md` first. If you are here to
change the code, read `DESIGN-NOTES.md` — it holds the decisions behind what
this file describes, and the reasons not to undo them.

The screenshots through this file regenerate with
`node tools/make_mockups.mjs`, so if one looks stale, rerun that.

## The tabs

### Dashboard

**Round five: the pit board.** Rounds one through four were a grid of modules,
and the last of them left five of eleven areas able to render nothing at all —
so on a quiet week, or on the SN5 archive where every run is retro, the page had
holes in the middle of it. Tighter packing does not fix that. What fixes it is
that a module which can vanish was answering a question nobody asked it.

So: **four lanes, each a question**, and a lane with no answer says so.

- **Stopped** — a run whose next step nobody can sign. Two shapes, and the
  difference matters: a blocker *at* the live step is work waiting on a person;
  a blocker *behind* it means the run walked past a gate, which is a record that
  lies and is worse.
- **Waiting on you** — the one thing the old board never answered. It walks the
  buy-off gate ladder in the order the button walks it — sequence, training,
  evidence, the cure clock, CS-013 — so it can never promise a signature the
  button then refuses. Missing evidence *demotes* a step rather than hiding it:
  pressing the button is how you find out what is short. A cure hold stops a
  member and offers a lead an override, so this lane is genuinely different for
  the two of them. And a design review on a run you created ranks down for you
  and up for everyone else, which is what CS-013 says and what nothing on screen
  used to show.
- **Due this week** — inside seven days, late first. Its header says how many
  are actually late, because "5 due this week" listing things from January is
  true and reads as a lie.
- **On the clock** — cures running, the next milestone, and the days to
  competition.

**The alert strip is gone.** It counted "Late 3" one row above the module that
listed the three: one fact drawn twice, in two places that could disagree. Each
lane header is its own numeral now, attached to the thing it counts. The
consequence is worth knowing — a run that is late *and* has a step you can sign
appears in one lane only, so the numerals do not sum to "everything open". That
is why each header says what its number is of.

**Nothing is ranked across lanes.** "Is this blocker more urgent than that
deadline" has no honest answer, and inventing one is how a board starts lying
quietly. There is an order inside *Waiting on you*, where everything is the same
kind of thing, and nowhere else.

Below the lanes, **the program** and **around the shop** sit side by side. The
program carries build progress, molds, money, this week's RFS bookings, the
store and the all-season counters — the facts that are a monthly read rather
than a daily one — and a fact with no value prints a labelled dash instead of
disappearing. Around the shop carries the filtered jumps and what has been
touched lately.

Side by side rather than stacked because each is then half the board's width,
and its contents read as a list down a column instead of a line strung across
1,300px. Four bars and six numbers spread over the full width are a sentence you
sweep your eye along; the same six stacked in 650px are a thing you read.

**Team lore keeps its own surface** inside that footer, below the rule. Stacked
straight under the activity feed with nothing between them it read as the last
row of it — one more thing that happened in the shop, rather than the one thing
down there that is not news.

A **guest** gets a different page rather than an emptier one — see below.


![Dashboard: the pit board](../design/dashboard-mockup-20260827.png)

Read-only, every element linking into the tab it came from. On a phone the lanes
stack in the day's order and the program and footer sink below them.

**What each lane says when it has nothing.** This is the part that matters, and
it is enforced rather than remembered: `laneShell()` is the only thing that
renders a lane and its empty-state argument is required, so a lane cannot ship
without one.

- Stopped — *"Nothing is blocked. Every open run's next step is available to
  somebody."*
- Waiting on you — *"Nothing needs your signature. 4 steps are ready for the
  people trained on them."* Or, for somebody with no grants yet: *"3 steps are
  waiting on Wet layup training — Nico and Justin have it."* with a jump to
  People. An empty lane that tells you how to make it non-empty.
- Due this week — *"Nothing is due before 3 Sep. Next up: SPLITTER."*
- On the clock — *"No cure is running."* plus the next milestone and the
  countdown, so it is never empty once a season exists.

**Season settings** (a lead, from the ⋯ menu) holds the season code, the
competition name and date, and the milestones. The code is the `SN6` in every
new id and the season the rails show by default. When the next car starts,
change it to `SN7`: ids restart at 001 on their own counters, the rails show
SN7, and every SN6 record stays where it is, one chip away. Nothing needs
deleting between seasons.

**Role.** A lead also sees purchases over $50 awaiting sign-off, cure holds they
could release, and open work with nobody's name on it. A member sees the steps
they can actually sign. A **guest** gets the showcase — the season, the build
progress, and what the team is making — rather than a work queue with everything
filtered out of it, which would be a blank apology. Nothing on the showcase is a
link into a record, because a guest following one would land on a permission
error.

### Season

![Season: the blueprint](../design/season-mockup-20260827.png)

The blueprint, and the tab that replaced the Composites Master Tracker
spreadsheet. One line per part the team means to make, most of them nearly
empty — which is the point, not a defect. In September the team
knows it is building a nosecone, an undertray and four side panels; it does not
yet know the layup schedule, the mold location or who is machining what. **A row
that exists with nothing in it is a commitment to build the thing.**

A row **is a real part**, with a `P-` id from the moment it exists. There is no
separate "planned part" record and no promotion step — "making the real part
file" just means filling the row in, here or on the Parts tab. So a blueprint
row is immediately linkable, schedulable and countable.

**It is a read.** The tab used to be thirteen editable columns, and thirteen
controls have a floor near 1,700px against roughly 1,300px of content width — so
it scrolled sideways at every real viewport, on every machine, always. Now a row
is a line: the part's name, its subteam, the C/M/L rail the Parts index already
draws, where it has got to *in a word*, and its deadline. Around sixty parts on
screen where eighteen used to fit, and no sideways scroll at any width, because
the lines are a wrapping multi-column flow rather than a table.

Nothing on a line is a control except the name, which **opens the part** —
ordinary click, ctrl-click for a new tab, Enter from the keyboard. Editing did
not go away; it went one click deeper, to the page that already carries the
evidence gate, the skip-ahead confirm and the move-back confirm. A part's state
never rests on colour alone: the rail carries a letter and a fill, and the chip
beside it is a word.

**Lay out the season** is the one thing the tab still writes — a list of names,
one per line, created in a single id block. It is what **+ Row** became, and it
is cheaper than **+ Row** ever was: laying out a season means typing twenty
names, and it never meant opening twenty pages. Running it twice is safe; a name
already on the blueprint is skipped.

Only this season: `retro` records are excluded, the same rule the Google Sheet
feed uses, because a blueprint for a season already built is not a blueprint.

**The sheet is downstream now.** The app still publishes the parts list to it
every 15 minutes, so it keeps updating itself — but it is a mirror, and an edit
made there is overwritten on the next publish.

Season is the planning view; **Parts** is the working view, a rail plus one open
record for when you are doing something to one part. Same records, two questions.

### R&D parts

> **Not the same thing as the R&D tab.** A coupon you cut this afternoon belongs
> on [the R&D bench](#the-rd-bench), where it is a row in a grid with no
> paperwork attached. This section is about a **part** — something with a mold,
> a work order and a traveler — that simply is not on the season's list. Both
> are called R&D and they are genuinely different records.

Not everything the shop lays up is going on the car. A layup trial, a mold
shakedown, a full-size panel made to prove a process — those are **real parts**:
real carbon, real resin, a real cost and a real deadline. What they are not is
something the team promised to deliver this season.

So a part can be marked **R&D**, and that means one thing and one thing only:
*it is not a season deliverable.* It is not scrap, it is not a draft, and it is
not exempt from anything. An R&D work order has the same blockers, the same cure
holds, the same evidence gates and the same buy-offs as any other, because it is
real work at a real bench.

What changes:

- **It is not on the Season tab.** That tab is the list of things that have to be
  on the car. The count in its toolbar says how many are being held back — `12
  of 20 parts · 8 R&D` — and the R&D number takes you to them, so nothing ever
  just disappears.
- **It is not in the Google Sheet mirror**, for the same reason.
- **Your Parts and Work Orders lists are the season list or the R&D list, never
  both.** The **R&D** chip above each one swaps between them: off, you see the
  parts going on the car, which is what those tabs are for on an ordinary day;
  on, you see only the trials. The chip carries the count, so the list always
  says how many it is holding back rather than just holding them back. Open a
  record from the dashboard or from search and it stays on the rail while you
  are looking at it, whichever list is showing.
- **The dashboard, the deadline lists and Reports never hide it.** That is
  deliberate and it is what makes the rails safe to filter: a trial that is late
  or blocked still finds you on the landing page.
- **Everywhere it does appear it is marked** with a black **R&D** capsule —
  both rails, both detail pages, the dashboard, search — and it is a column in
  both CSV exports, so you can still total it.
- **Its work orders inherit it.** Start a run on an R&D part and the run is R&D;
  nobody has to remember. A run with no part of its own — a bar cast on the
  bench for a shrinkage test — can be marked on its own with **+ R&D run**.
- **It says so on paper too.** The printed traveler carries an `R&D — NOT A
  SEASON DELIVERABLE` stamp beside the usual Draft or Retro one, and a **Build
  type** line in the body in case the top of the sheet gets cropped. The 4×1
  label carries a boxed **R&D** next to the ID. Scan that label and the nameplate
  says it too.

**Making one:** the Parts tab has two buttons — **New Part** and **R&D part** —
and Work Orders has **New WO** and **R&D run**. There is no dialog asking you
which; you press the one you mean, and the badge is the first thing on the page
you land on. Adding a row on the Season tab always makes a season part, because a
row on the blueprint is a commitment by definition.

**Changing your mind:** while a part has no work order against it, R&D is an
ordinary checkbox on its page and anyone can flip it either way. Once a run
exists, it locks: a **lead** can move it *into* the season, once, and nothing
moves a season part back to R&D. That is what makes the season count worth
trusting.

**Promotion keeps the ID.** `P-SN6-042` is still `P-SN6-042` afterwards — its
label is still on the shelf, its traveler is still in the binder and its QR
still resolves. All that changes is that it now appears on the blueprint. The
move is written to the part's own comment log with your name on it.


### How parts, runs and molds fit together

The part is the parent record. It is the thing the car needs, and it outlives
every attempt at making it. Everything else hangs off it:

```
Part ─┬─ Work orders   one RUN each at making it (a remake is a second run)
      │    └─ Issues    what went wrong on that run, and how it was disposed
      ├─ Mold ── Mold file ── Drawings
      └─ Scheduled weeks
```

Every record in that chain shows the same lineage bar across the top, so you
can walk up to the part or down to the drawings from wherever you are.

Older records join by part name rather than by a real link, and the app says so:
a run matched that way is labelled *matched by name* with a **Confirm** button
that writes the real one. Most of the SN5 data starts out matched by name and
gets promoted one part at a time as people open things. Two parts sharing a name
is the one case that refuses to guess — there is no way to know whose run an
unlabelled work order was, and duplicate part names are a real pattern here.

**+ New run** on a part starts another work order against it, carrying the
part's name, subteam, deadline, mass target, process and layup plan. A part
that already has runs asks first: **Start fresh** from the part's own plan, or
**Use a previous run** — pick the source run and tick what to keep (the mold
and its mold file, the uploaded files and doc links, the as-built layup stack,
the BOM, the quality criteria with actuals blanked). Everything carried is a
reference to records that already exist, so a botched mold machining gets a
second run with the same mold CAD without re-uploading a thing. A carried stack
is labelled as-built, so if it differs from the part's plan the divergence
banner says so instead of pretending it follows the plan.

The mold works the same way: until somebody commits the link the mold is
derived through the part's runs and shown as *via WO-…*. Set it once and the
mold's own "used by" list and the QR label pick it up. A part's mold progress
and the mold record's stage are deliberately **not** synced — they are different
scales maintained by different people, so the app points out when they disagree
rather than quietly overwriting one.

### Work Orders

![A work order: the rail grouped by part, and the whole traveler in one scroll beside it](../design/workorder-detail-mockup-20260825.png)

Work Orders is the manufacturing traveler: layup stack, BOM, step buy-offs
stamped with who signed them, blocker enforcement, enforced cure holds, and a
printable hand-fillable sheet that is always exactly two pages. A lead can
override a cure hold from the "Why N hours?" modal, but never below the
datasheet's own floor.

It is a split view, like Parts and Molds. The rail indexes every run grouped by
the part it builds; each row shows how far through its buy-offs the run is and
whether it is blocked or curing. Runs whose part cannot be resolved collect in a
named block at the bottom — on the SN5 archive that is most of them, and it is
the to-do list for linking them up. Parts nobody has started appear too, with
the button that starts a run. Group, sort and filter are yours to set.

The pane is one scroll, ordered Steps, Details, Stack & BOM, Photos, Quality,
Files & docs, Notes & log. Steps leads because that is what you came to do. A
bar above it jumps to any section (`1`-`7` from the keyboard) and carries a
count per section, plus a dot when something wants attention, so you can see
there are five plies or that a check failed without scrolling to find out.

The BOM inside Stack & BOM is the run's **plan vs as-built** record. A run
copies its part's Materials (plan) at creation, and the read view shows Plan,
Used and Cost per line with a money summary beside the count ("planned ≈ $41.20
· used $63.00"). **Consume** on a line logs what actually went in: the cost
freezes at that moment's unit price, a board ref decrements the shelf count, and
a lot ref asks the only honest stock question free-text quantities allow —
still fine, running low, or now empty. The cure buy-off asks the same question
for every open line at once, prefilled from the plan, so the common case is one
confirm and zero typing; a consumed line never logs twice, and the undo bar
covers the whole batch. When a run's actuals differ from the plan, an **↩ plan**
button pushes reality back onto the part, so the next run starts from what the
last one learned. The printed traveler carries the costs and a materials total.

Every section header is also a fold. Steps and Stack & BOM open by default (you
read the stack while signing "Stack frozen"); the reference sections start
closed, a warned section never starts closed, and edit mode opens everything.
Folds keep their state while you stay on the record and reset when you switch.
Notes & log opens itself with a gold "new" dot when somebody wrote a note since
you last looked. Gold means new, amber means trouble, and the two dots never
trade jobs.

The steps read as a traveler spine: a hairline runs down the number column and
each step's number is a circular node on it — green ✓ walked, the one gold node
is the step to act on NOW, an amber ring is a blocker, slate ◷ waits on a cure
clock, red ✗ failed, and an outline node on a dashed spine has not been walked
yet. Four or more consecutive signed steps compress into one counted line
("Steps 1–8 · 8 done · 9 photos") with the full rows one tap inside, so a
half-signed record reads solid green, one gold node, then dashed, from across
the bench.

What is true of the whole record stays above that bar: which run it is, its
status, the lineage bar, and anything blocking it, including a cure hold, shown
as a clock time rather than a countdown. Unlike Parts, this rail does not hide
finished runs by default, because reading back what was done is half of what a
traveler is for.

A work order is one run at making a part, so its layup stack is what that run
**actually laid**, while the part's stack is the **plan**. Editing the plan
pushes it to every run still following it; editing a run's stack marks that run
as-built and never writes back. When they differ the run says how many plies
moved, with a side-by-side compare and an explicit *Adopt as the part's plan*. A
run whose "Stack frozen" step is signed is left alone by plan edits entirely —
the bench is working to that piece of paper.

The stack itself is an editable table: change any field in place, insert a ply
above another, duplicate, reorder toward or away from the mold surface, or
delete. P1 is the mold surface and the table says so. Two people editing the
same stack at once merge rather than overwrite each other; only reordering is
last-writer-wins, because two people reordering the same stack has no correct
answer.

Material colour is a swatch beside a short text tag (CF, Spread, Core, Mesh), so
the distinction survives greyscale, a colour-blind reader and the black-and-white
laser. Hue is never the only thing carrying the meaning.

**Deleting a run takes everything that only existed because of it.** Firestore
has no cascade, so deleting the document used to leave a trail every time:
issues whose work order no longer resolved — and an issue cannot exist without
one, the app refuses to make one — every photo and CAD file still sitting in
storage where nothing could find it again, and links on parts, molds and test
panels pointing at nothing. There is one delete path now and it takes a list,
so the single delete gets the same cleanup. **Select…** on the rail is open to
every roster member for **Archive** and Restore, which is the normal way to put
a finished or abandoned run away; the Delete button inside it appears for leads
only, because the database rules allow the delete to leads only. Delete ticks
as many runs as you like; the confirm counts exactly what goes — so many issues, so
many uploaded files — and what merely loses a link, since a part outlives the
run that made it. Material a run already consumed stays consumed, because it
really was used, and the confirm says so. There is **no undo**: a deleted file
cannot be brought back, so the offer is a backup export first instead.

### Parts

![Parts: the split view, each stage a row of steps](../design/parts-mockup-20260827.png)

Parts is last season's Part Tracker reborn, and it leads the Build group because
the part is where the work starts. Each part carries three parallel progress
stages (CAD, Mold, Layup) plus subteam, layup type and schedule, engineers,
target weight, and a layup deadline.

The page is built from the same section cards as a work order: a jump bar with a
count per section and a warn dot, Progress, the layup stack and the runs open by
default, and the reference sections folded until asked for.

**Archive, don't delete.** A part you are done with gets **Archive** on its
page (in edit mode) or in **Select…** mode on the rail, where any roster
member can tick several and archive them together. Archived parts leave the
rail, the dashboard and the Season blueprint but stay in the database with
who archived them and when; the **archived** chip on the rail shows the list
and offers Restore. Delete is still there for leads, inside Select… and on the
page, for records that should never have existed. It is the same one path with
a list of one, there is no undo, and work orders that pointed at a deleted
part keep their link field.

**This season by default.** The rail reads a part's season off its id
(P-SN5-001 is SN5) and shows the current season only. Last season's parts are
one chip away, named after the season when there is only one (**SN5**). The
chip stays on as you move between Parts and Work Orders.

Both rails keep their scroll position across every re-render. Ticking a box
or opening a row used to throw the list back to the top and then park the
selected row on the bottom edge (v4.2.1 fixed it, in `render()`).

**Materials (plan)** sits between the stack and the runs: the part's expected
bill of materials. A line is either free text or picked from inventory, and a
picked line prices itself live from that record's unit cost (qty × $/unit), so
the section header can say what the part should cost to make. The rollup always
carries its coverage ("≈ $66.50 · 1 unpriced") — a sum over gaps never pretends
to be complete, and an empty plan says nothing rather than $0.00.

Its **Runs** section is the rest of the picture: every run against the part with
status, due date and ply count. The **Mold** section holds the mold and its
**mold file**, with buttons straight to the 3D view and the drawings;
scheduled weeks live under **Links & files**.

("Mold file" is the stack plan record, `STK-…`: the slicer's output for how the
mold gets cut out of tooling board. The lineage bar and the part page call it
the mold file because those screens already use "the plan" for the *layup*
plan, and two different plans on one screen is confusing. The Molds tab, where
it is shown as a record in its own right, still calls it a stack plan.)

SN5 parts have no layup plan of their own — the old tracker recorded the layup
against the job, not the part — so a part with no plan shows what its run
actually laid, labelled as borrowed, with one click to adopt it as the plan.

Above 900px it is a split: an index of every part down the left, the selected
part beside it. Opening a part does not destroy the list and going back does not
destroy the part, so you can work down your own parts without the page swapping
under you: `↑`/`↓` or `j`/`k` walk the index, `1`/`2`/`3` advance CAD, Mold and
Layup on whatever is open, `/` searches and `esc` clears. With nothing selected
the right pane is the season instead: how the open parts are spread across the
three stages, and who owns what is behind. Below 900px the index is the page,
tapping opens the part, back returns.

Each stage is a row of its own steps, and you set it by clicking the step you
want. There is no edit mode for progress, because advancing a stage is the thing
people do most and it used to cost five interactions. Moving forward one step
writes immediately and leaves an undo; moving backwards, declaring a part flat,
or skipping steps asks first and names what it would skip. This is a live shared
database, so the surprising directions are the ones that get a confirmation.

A stage that hasn't started reads grey, never amber.

### Molds

![Molds: a mold, its stage, and its mold file on one screen](../design/molds-mockup-20260825.png)

Molds is a Parts-style split: a persistent rail on the left, the selected record
on the right. The rail groups every mold by the stage it is at, in process
order, so it reads as the pipeline it is; a stage nobody is at gets no header.
Arrow keys or j/k walk the rail, `1` advances the selected mold one named stage
with the same undo bar as the stepper, `/` searches, esc goes back. On a phone
it collapses to list-then-detail, exactly like Parts.

A mold runs **Designed, Tooling cut, Board glued, Machined, Sealed, Ready for
layup**, with Retired off to the side. *Tooling cut* means the blanks are off
the ShopSabre but not yet glued into a stack, which is where a mold sits for
most of a weekend; before it existed a half-cut mold was either still Designed,
which put it back in the cut list, or already Board glued, which it was not.
Watch the two senses of "cut": tooling cut is the boards coming off the saw,
Machined is the mold surface coming off the CNC.

The mold's stage is set on a **stepper**: the whole enum laid out as tappable
steps at the top of the detail card, current filled, the rest outlined — the
Parts tab's idiom, so the display and the editor are the same thing and can't
drift. It replaced a `<select>` behind Edit plus a next-stage button, which
made "we skipped sealing" or "that actually went back to the board" a
four-interaction trip. The writes are graded exactly as on Parts: one step
forward applies at once with the undo bar, skipping ahead asks and names the
steps it would mark done, moving back asks (it erases recorded work), and
Retired — rendered dashed and off the track, like the parts stepper's N/A —
asks before taking the mold off the rail.

A **mold** used to exist only as free text inside one work order, so two work
orders using the same mold held two copies of the truth and its location was
wrong the moment anybody moved it. Now it is a record with its own stage, home
location, sealing date and a count of parts pulled off it; the work orders and
parts that used it are a live join.

A mold's **stack plan is part of the mold**, not a record beside it. The
rotatable 3D view of the mold sitting inside its translucent stock, the exploded
stack, the blanks table, the drawings and the STL export are all on the mold's
own page. Only a plan with no mold to be reached through gets a row of its own.

**Board grade is typed, not picked from a list.** The shop mostly runs 30 and
60 pcf, but the rack has always held sheets of other grades and the old dropdown
refused to say so — a mold set to 45 matched no board at all and silently
re-prefilled as 30. Entry is free, with the catalogue plus whatever is actually
on the rack offered as suggestions.

**Grade is a range, and leaving the max blank means one grade.** A mold that
only ever gets planned at 30 is planned exactly the way it always was. Give a
range — say 30 to 45 — and any board inside it may supply any blank, including
two grades glued edge to edge in one layer, which is what lets the planner use
the rack it has instead of reporting a shortfall while standing in front of a
full shelf. CS-004 has not moved: the grades are still not interchangeable
*silently*, and the range is where somebody says so out loud.

The cost of saying so is that the mold no longer has "a density" — it has a set
and a **maximum**, and the maximum is the number that matters, because the
densest board in a glued stack sets the ShopSabre feed rate for the whole
thing. So the app says it wherever the cut is about to happen: a band on the
cut list and again in the "mark cut" modal, a column on the molds list, and the
title block of **every drawing sheet**, in the largest type in that block.
Before the cut it reads as the planned range; after it, as what actually came
off the rack, per layer as well as overall.

The planner also prefers the board **nearest the top of its own pile**, priced
at 5% of the blank you get off it per board it has to be dug out from under.
That is deliberately small — nesting and offcuts matter more, and on the real
rack a board would have to be about thirteen down before the preference could
pick a worse nest. It earns its place among near-equal candidates, which a
density range creates a lot of: two sheets of the same size at different grades
cost exactly the same, and "the one on top" is a better tiebreak than "the one
whose id sorts first". The plan page shows what each board was charged and
whether the lift actually decided anything, so the number can be argued with.

**Plan a mold** takes an STL (or a typed rectangular block), picks board
thicknesses that waste the least, splits tall molds at the ShopSabre's
cut-depth limit, prints a numbered cut list and a dimensioned engineering
drawing set, shows the mold sitting inside translucent stock in a rotatable 3D
view, and exports the planned blocks back out as STL so CAM can use them as the
stock body. Planning also creates the mold record itself, at "Designed", with
the plan linked to it, so the record exists from day one of design instead of
being back-filled after machining. Three sample molds ship with the app, so the
planner can be tried without exporting anything from Fusion.

**Select… is everywhere.** Every list that holds records has the same
picker: a quiet Select… button beside the tab's actions, then All / None / a
count / Delete / ✕, a box on every row, and the whole row toggles because a
checkbox is a small target on a tablet. It started on Work Orders, Parts and
Inventory and now covers Molds (with their unlinked plans), Boards,
Purchases, Documents (uploads; the bundled guides have nothing to delete),
R&D studies, Schedule weeks, the Season blueprint and People. One
implementation in core.js (`pickBar`, `pickBox`, `bulkDeleteRecords`) rather
than a copy per tab, so they cannot drift. All picks what is on screen, so a
search or a folded-away past week is respected. Delete is one confirm that
names what goes with the records: a mold's stack plans and meshes, a
purchase's receipt, an upload's file, a study's batches and coupons (undo
offered), a week's goals and carpools. The single Delete buttons take the
same path, so the wording and the cascade never disagree. It is offered only
where the rules allow: leads on the lead-only lists, every member on R&D
and Inventory, and never yourself on People.

**Stepped or solid.** By default each layer's blank only covers the mold over
its own slab, so a tapered plug gets smaller boards up top and the glued stack
is a staircase; that is what the planner scores, because it uses the least
board. The STL fields also offer **one solid block around the whole mold**:
every layer gets the same rectangle, the mold's full outline plus margin, so the
glue-up is one brick with nothing to line up between layers and the stock body
CAM sees is a plain box. It is opt-in, a re-plan keeps whichever shape the mold
last had, and the plan page says "as one solid block" so nobody reads a brick as
a planner mistake. The cut list does not care which was chosen: a block layer
is still one rectangle per board, packed onto sheets with the same
straight-through cuts as any other blank.

![Molds: the season view when nothing is selected](../design/molds-overview-mockup-20260825.png)

With nothing selected, the right pane is the season: where the live molds sit
across the stages, how much board is on hand (a tile that opens the rack in
Inventory), and whether the planned blanks actually fit it. Below that, "Needs
a hand" — rendered only when it has something in it — collects the four
questions that were previously answered in four places or nowhere: molds with no
home location, molds past "Designed" with no stack plan on file, plans carrying
a slicer warning nobody has read, and plans with no mold to be reached through.

**From Fusion.** The FEBPlanStock add-in (`10 Fusion Add-in/FEBPlanStock/`,
install steps in its README) runs the same modal from inside Fusion: select
the mold body, optionally the face that is its bottom, press Plan stock on
the FEB panel, and the app opens in a palette with the mesh already loaded in
millimetres. Plan as usual; the app writes the same two records, and the
layers go back to Fusion, which draws one see-through box per blank in a
component named after the plan. The bottom face matters when the mold is not
modelled bottom-down, which a split mold rotated onto its side never is: the
add-in lays the mesh flat on that face before it exports, sends the matrix it
used, and draws the boxes back through its inverse, so the plan is upright
and the boxes sit over the mold as modelled. The plan keeps the matrix, the
stock STL export undoes it too, and the mold card says which way the picked
face faced. A mold
made that way carries a **Fusion** section on its card: document, body,
version, project, who exported it and when, a Copy name button, and an Open
in Fusion Team link to the document's page in the hub. There is no deep link
into the desktop app, because the `fusion360://` scheme did not open a
document when it was tried; the Fusion Team page has Autodesk's own Open in
Fusion button. The page side is `fusion.js`, which does nothing unless
Fusion's bridge object is present.

**The section split can be waived, per mold, at planning.** A stack over 6in
is normally split into sections machined separately, because that is as deep as
the ShopSabre plunges. Sometimes the design gets around it: a shallow cavity in
a tall blank, dowelled inserts, a face machined from both sides. Sectioning a
mold that does not need it costs a setup and a mating surface, so the planner
has a **Machined depth stays under 6in** tick.

It is worded as the claim, not the outcome, because the claim is the thing that
can be wrong. Nothing in the app measures the cavity, so the plan takes your
word for it, records who gave it, shows a **split waived** note on the mold, and
still says on the drawing that the blank is taller than the machine reaches. The
person reading that drawing at the bed is not the person who ticked the box.
Molds that do not waive are untouched: same split, same `SPLIT` callouts, same
expectation of dowel and datum features in CAD.

One thing a waiver never silences: a single board thicker than the machine can
cut still warns. No design trick makes that one go away.

**Datum cut plans** hang off the mold as files: the drawing of the reference
cuts taken off a mold once a part has come out of it. Most molds never need
one, so it is a file field and not a stage. Attach anything the rest of the app
accepts, native CAD included; a PDF opens in the app rather than sending you to
Preview, and a photo joins the mold's lightbox roll.

This is also the first time anything could be attached to a mold at all.
`storage.rules` had no `molds/` tree, and a path with no rule is denied, so the
photos people had been pasting into a mold's Notes had been failing at upload
for a season behind a toast that read like bad wifi. Same for Items and Lots.

**The cut list only offers molds still at "Designed".** It used to pack every
stack plan on file, forever — retired molds, last season's, molds already
machined, and both halves of every re-plan. That is worse than a long list:
nesting is a pool problem, so one stale plan changes which boards get opened
for everything else, and then somebody cuts a mold that was cut in March. The
screen says how many plans it held back and why, and offers any plan with no
mold a mold, which is how an orphan gets back in.

There is no "show everything" checkbox. To cut a mold again, walk its stage
back, which asks first and says it erases recorded work. That leaves a trail
where a checkbox would leave nothing.

**Every offcut is reviewed before it becomes a board.** The mark-cut confirm
used to be one checkbox per board and the words "keeps 2 offcuts": the board
left the rack and two `BRD-` records appeared with dimensions nobody had looked
at. A remnant is the thing the packer is most likely to be wrong about, because
it is whatever is left after everything that mattered was placed.

So the confirm is a pane. Every offcut is a row saying which board it came off,
what it will be called, and how big it is, and all of that is editable. Add a
piece the packer never predicted, drop one that did not survive, correct a size
that was measured rather than computed. Sizes are typed in **millimetres**, with
the inches beside them, because this app stores what the packer measured and
redisplaying canonical millimetres in inches drifts a little on every edit.

Pieces under 4 in. are shown too, greyed and unticked. The packer has always
treated them as loss rather than stock, and still does when it chooses how to
split a board — but whether a 3 × 20 in. strip is worth keeping is a judgement
for whoever is holding it, and hiding the piece made the pane lie about what
comes off the board. Type a real size into one and it stops being scrap.

New offcuts carry a real link back to the board they came off, not just the
sentence they always had, and the undo bar offers to print their labels. That
is the only moment anybody knows which `BRD-` numbers are new.

**Marking boards cut moves the mold to "Tooling cut"**, and the toast says so.
Otherwise the filter would just be an irritation: every commit would need
somebody to remember to advance the mold by hand, and within a month people
would leave molds at Designed so the cut list kept working. The undo bar puts
the stage back along with the board.

### The cut list, on paper

Two documents, one renderer. The batch set is the whole thing; a mold's cut
sheets are that same document filtered to the boards that mold touches — same
pack, same drawings, same scale, so a given board's sheet is identical in both
and you can lay them side by side.

**On a mold's drawing set**, after the layer sheets: a **cut schedule** — every
blank this mold needs, which setup it feeds, which board it comes off and at
what grade, plus the boards to pull and where they are on the rack — and then
**one sheet per board**, drawn large, with the nest, the numbered saw cuts and a
table naming everything on it. Nothing new to press: the existing **Drawings**
button produces the fuller set.

**Off the Molds tab**, the cut-list screen's **Print cut list** now produces a
proper sheet set of its own — a cover with the totals, the feed rate, any
shortfall and any warning, then a tearable schedule page per mold, then the nest
sheets. It replaces the one printable in this app that bypassed the house print
system entirely, so it gets the preview, the grayscale proof and Save with it.

Everything survives a black-and-white laser, because that is what it prints on.
**Your blanks are the clean ones** — heavy outline, no fill, tagged. Another
mold's are hatched and thin, and named in full in the table beside the diagram;
offcuts that go back on the rack are dashed. The words **THIS MOLD** appear in the
table as well, because that is the distinction that survives a photocopy of a
photocopy.

**The nest is the whole shop's plan, not one mold's.** That is the only way to
show what else is on a board — and it means the sheet is a function of every
planned mold and the whole rack, so it changes when an unrelated mold is
planned. Every cut sheet therefore carries a batch stamp: the date, the plan and
board counts, and a four-character tag. The tag answers the one question the
date and the counts cannot — *are these two printouts from the same pack?* — and
it is the thing to check before cutting to a sheet that has been in a drawer.

If the planner had to narrow its search (a large batch, where it scores only the
smallest few boards that could hold the biggest blank), the sheets say
**PRELIMINARY** in the title as well as in the notes, so a page separated from
the set still carries the caveat.

The rack itself is not here. A board is a thing on a shelf, so it lives in
Inventory beside the items and the materials; see below.

### Issues

An issue is a production nonconformance: something went wrong on a run, and it
needs a work order, a disposition and a documented root cause before that run
can close. Issues live **on the work order they hold up** — the Issues section,
straight after Steps.

The section lists every issue on the run, flat, open ones first. Each row names
it, says what state it is in, links back to the step it was filed from if it had
one, and — for an open one — carries the disposition select and the root-cause
field right there, with one Resolve button. A resolved row reads "resolved:
&lt;method&gt;" with a quiet Reopen. The section header counts disposed/total and
wears a warning dot while anything is undisposed; that dot overrides the fold,
so an open issue can never be tucked out of sight.

![Issues: on the run they hold up](../design/wo-issues-mockup-20260825.png)

**Raising one** is the ⚠ button at the bottom of the section, or the flag button
beside any step's camera. Both are one small modal — title, what happened,
photos attached at creation, priority — because the work order, the assignee,
the subteam and the watchers are all already known, and because you are mid-run
and should not be sent somewhere else. A step-filed issue remembers its step and
shows as a chip on it, amber while open and a check once disposed.

**Closing one** goes through a single gate, wherever you do it. Set a work order
to Complete while issues are still open and the refusal opens a closeout modal
rather than a dead end: one row per issue with its step context, disposition and
root cause inline, per-row Resolve or "Resolve all & complete work order", and a
confirmed "Cancel ticket (false alarm)" for the ones that turned out not to be
real. Every resolve saves immediately, so backing out mid-way loses nothing.
Reopening clears the disposition — a work order must never complete over an
issue somebody has just said is not actually fixed — and the withdrawn method
survives as a comment.

Disposed-but-open is a real state, and it is what lets a work order complete
while the issue stays open for follow-up.

**Finding one** when you do not know its run: the Work Orders rail has an
`issues` chip that filters to runs with something still open, and the Dashboard
carries issues in its deadline list and its activity feed like any other record.

> **The Tickets tab was shelved in v1.0.0.** The app tracked projects as well as
> issues until then; it tracks work now. Every existing ticket is still in
> Firestore and still opens from a link or a chip — the tab is only off the
> sidebar. See [SHELVED.md](SHELVED.md) for what was paused and how to bring it
> back.

### Schedule

One tab, two views behind a toggle: the season by station, and the week by
person. They were separate Timeline and Weekly Plan tabs until 2026-08; old
links to either still land in the right view.

![Schedule: the season by station](../design/schedule-mockup-20260825.png)

The season view is the production schedule as a station by week grid: stations
are the rows, weeks are the columns, and tapping a cell picks the part that runs
at that station that week. Every write leaves an undo bar, because it changes a
schedule the whole team reads. The current week is called out in gold, and "Jump
to this week" finds it in a long season. On a phone the grid becomes one card
per week listing only what is booked, with finished weeks folded behind a button
so this week is the first thing on screen. Undated weeks from the SN5 import sit
in a collapsed archive below the live schedule.

The week view is the same schedule cut the other way: one card per day, split by
car group, saying what happens and who is at RFS, plus a per-person weekly
rollup pulled from ticket due dates and manual assignments.

### Budget, People, Documents

Budget runs a purchase along two tracks, because a purchase has two lives. The
order status says where the goods are (Submitted, Purchased, Arrived); the
reimbursement status says where the money is (Submitted, Approved, Reimbursed).
They advance independently, so a part sitting on the shelf that nobody has been
paid back for is finally something the tab can express. The over-$50 flag hangs
on the money track: it clears when a treasurer marks the reimbursement Approved,
not when somebody marks the goods bought. Purchases written before the split
need no fixing, since the old vocabulary is read through the new one (Ordered is
Purchased; the old Reimbursed is arrived and paid).

**Charged to** names the budget a purchase lands on. Blank means ours and
behaves as it always did. Name another team's budget and the cost is still
tracked, the purchaser is still owed it, and the $50 rule still applies, but it
stays out of the composites season total and out of every goal bar. That is the
McMaster run somebody makes for the whole team: real money, not our line. The
field is free text on purpose, since the subteam names belong to them and a list
we guessed at would be wrong in a way nobody could fix from the app.

The list carries the season total, an other-budgets subtotal when there is one,
counts for what has not arrived and what is still owed, and filters on either
track or on whose budget it lands on.

A purchase can carry **line items**: one row per thing, typed the way a receipt
reads (total and count) with the unit price deriving live as you type — $20
across 4 shows $5.00 ea before you leave the cell. Lines never change the cost
field on their own; instead the section shows the line sum with a quiet "matches
cost" chip when the two agree, and a warning plus an explicit **= set cost from
lines** button when they don't. Whether a line's contents ever reached a shelf
shows in Inventory's Incoming strip. The budget CSV exports both cost and the
line sum, so a mismatch survives into the spreadsheet.

With a receipt photo attached, **✨ Fill from receipt** reads it into proposed
lines. Parsing only ever prefills the same editable grid: every cell stays
fixable, existing lines are never touched without a confirm, and if the service
is down the button says so and the manual editor carries on.

People is the team roster with photos, roles, and each person's live assignments
across parts, projects and work orders. Leads can set roles, and trainings are
granted here: capsule pills on the list, a bulk "Record training session" modal
for the night a group gets certified, and a per-person checklist for
corrections. A Matrix toggle flips the tab into the planning read — rows are
people, columns are trainings with a coverage count over the full roster, and a
lead clicks a cell to certify or revoke on the spot (members see the same grid
read-only, provenance in the tooltip). The catalog is lead-editable under the
Catalog button: the six built-ins can be renamed but never removed, while new
trainings (a name, a ≤4-character code, optionally the CS standard that is its
curriculum) archive instead of deleting, so every historic grant keeps rendering
its name. A new training gates nothing until a step template references it —
adding to the catalog is bookkeeping, gating stays a deliberate act.

Documents is the team shelf (pinned links to the things people keep asking for),
member uploads, and the **25 manufacturer datasheets**. Anyone can upload a doc.

What the tab advertises is a data change, not a code change: the switch is
`UNLISTED` in `tools/gen_docs_manifest.py`, and everything is copied into
`docs/` and served whether it is listed or not. That matters, because
`resins.js` deep-links six datasheet PDFs by path for its TDS citations and
CS-000 requires an issued standard to stay retrievable — so unlisting removes
the manifest entry and never the bytes.

Currently unlisted: the **CS standards and pain-points** (off since 2026-08-18)
and the **shop printables guide** (off since 2026-08-26). The datasheets went
off on 2026-08-18 and came back on 2026-08-26. Add or remove a category name in
that set to change it; nothing else needs touching. Re-run
`tools/gen_docs_manifest.py` afterwards to rewrite `docs/manifest.json` (it
needs Python 3).

### Inventory

![Inventory: the storage map](../design/inventory-mockup-20260825.png)

Inventory is the storage map, and it absorbed the Items and Materials tabs. The
default view is one card per storage location (shelf, rack, cabinet, bin),
grouped by CS-011 site, each showing a live summary of its contents and its
problems: expired lots, a flammable lot outside the rated cabinet (§6 as
warning chips), things flagged running low, and how long since anyone confirmed
the shelf. Resin and hardener sharing a shelf is deliberately not a warning:
the team stores them together, matching the campus EH&S filing.

The map is filtered, not a wall. A search box matches a shelf on its own name,
site or kind **or** on the name, vendor lot or material type of anything on it,
so "195 twill" leaves the shelves that actually have some; the four summary
chips are real filters. Cards sort alerts first, then never-walked, then stale,
then — within a rank — shelves with something on them before empty ones, then by
name. A fixed order, because the map's job is to put what is wrong in front of
you. A shelf with a bad warning leads with the warning and wears a red spine.

Every location is a card, including the empty ones, and clicking anywhere on a
card opens that shelf. An empty shelf is drawn quieter — inset surface, no
shadow — and its site header counts how many of the site's locations are empty.

New shelves are created here, with **+ Location**. **Confirm contents** is on
the card, so CS-011 §7.1's monthly walk is one click from the map. Everything
unhoused sits in a bar above the shelves.

![A shelf's contents page](../design/inventory-contents-mockup-20260825.png)

Tap a card — anywhere on it, the whole card opens, with Confirm the one
exception — or scan the shelf's own front-edge label, and you are on its
contents page: every mold, board, panel, jig, lot and part that lives there,
in sections with the count in each header, each row with a Move button.

Each kind is its own card — the Boards idiom — with the kind's accent color
down the card's spine and the count in its header. On a phone the name owns
the row: the mix-ratio/TDS tail and the state breakdown drop out below 700px
and a long name wraps instead of truncating.

**Identical containers fold into one line.** The EH&S import made this matter:
ten AT30 jugs are ten records (one tag, one container) and were ten identical
rows. Lot rows now group by material — matKey when set, else the name — so the
line reads "AT30 SLOW EPOXY HARDENER ×10" with the states, the soonest expiry,
a flammable marker and the price on it, and opening it lists each container
with its EH&S code, which is the only way to tell jug six from jug seven while
holding one of them. The code a row shows is **the strip printed down the
right edge of the tag**: the last twelve characters, in the label's own
four-character groups, **with the final group at full weight and the rest
dimmed**. That strip is the part still readable on a jug whose label is wrapped
round the neck or wiped with acetone, so it is what somebody comparing the
screen against the thing in their hand can actually read out. The emphasis is
there because comparing and scanning are different jobs: across the 627 real
tags in the RSS export only the last five characters vary, and across FEB's own
50 containers only the last three, so an undifferentiated strip is nine glyphs
of shared prefix in front of the ones that tell two jugs apart. Dimming rather
than dropping them keeps the comparison honest. The whole code sits in the
row's tooltip. A material with one container stays a plain row. The
folded groups still print open, because this page is the stock-walk sheet.

**Add here** creates a record already located. **Move here** scans the label
on each thing you are putting down, the inverse of the Move flow — and the
camera stays open between codes, so a pile is one scan each rather than one
modal each. **Confirm contents** stamps who walked the shelf and when. The
Items-list and Materials-list toggles keep the flat tables; the Materials list
groups the same way by default, with a Grouped/Flat switch, and drops to flat
rows while searching.

**Select…** on the Items and Materials lists is the work-order picker for
inventory: tick rows (a group's box is all of its containers, and All selects
only what the current filter shows), then one Delete with one confirm. Open to
every member, not just leads — inventory is shared property, and the rules
changed to match on 2026-08-28. The confirm is honest about the blast radius:
an occupied storage location is left alone entirely (empty it first), a lot a
signed cure or panel references is deleted with the pointer keeping the id as
text (history does not get rewritten), and purchases drop the deleted
containers from their received lines. There is no undo.

#### Boards

![Boards: the tooling rack](../design/inventory-boards-mockup-20260825.png)

The fourth toggle is the tooling rack, which used to be a third group on the
Molds rail. A board is a thing on a shelf, and this is where the shelves are.

A full 4×8 sheet and an offcut are the same kind of record, so remnants come
back into stock instead of piling up. **One row is one board.** Rows lead with
the **board id** — that is what the printed label on the sheet says, and what
you read off it standing at the rack — followed by the size. Two identical
sheets stacked on each other are two lines with two ids, because a BRD- label
is stuck to a physical board and a mold points at the one it was cut from, so
collapsing them into "+3 more" made a specific sheet impossible to track. Sizes
are still counted in the card headers, and a board page links through to the
others of its size, which is where **+ Board this size** lives. Sizes are grouped
by **grade** by default, since that is the axis the packer will not substitute
across unless a mold says it may (CS-004 — 60lb seals better, and you cannot
swap it in silently), which makes it the axis that decides whether a job can be
cut at all.

One control does **grouping and sorting**, the same one Work Orders has. Group
by grade, thickness or shelf and you get a card each; sort by **rack order**,
size, board id or newest and the cards flatten into one table with the grade as
a column. Rack order is the one worth knowing about: it is where a board sits
in its own pile, so a row says "on top" or "3 deep", and it is the same number
the planner spends when it decides which board to open — the list and the
packer share one definition rather than two that could drift. A shelf card
regroups from the boards themselves, so a size that lives on two shelves shows
on each with only what is actually there, and reads **top of the pile down**
with each board saying how deep it is — a shelf card is a picture of a stack,
and rack order is the one thing that only means anything within a shelf. Touch nothing and the order is what
it always was: grades ascending, thinnest first inside each.

Quantities are **volume in ft³**, not area. A mold is cut out of a solid and
eats thickness, so a 3in and a 1in sheet of the same face are not the same
stock at all. Cubic feet because density is already lb/ft³: the two multiply to
the weight of what is on the rack, which the panes show alongside.

Every board carries a free **notes** field — a soft corner, a bumpy face, an
off-colour batch, which end is square. Notes show under the id in the list and
in full on the board's own page, and the search box matches them.

**+ Board this size**, on a size page, opens the form already filled in with
that size and grade, in the units it was measured in. Label, shelf and
provenance stay blank, and quantity starts at one: it is another sheet of that
stock, not a copy of that sheet.

Molds keeps exactly one number: the ft³ on hand, as a tile that opens this
list. "Have we got board" is a mold-making question even though the rack is not
a mold-making record.

#### Receiving

![Receiving: many things, many shelves, one pass](../design/receiving-mockup-20260825.png)

**Receive a delivery** is a page, not a dialog: a working sheet with an index
above it, reached from the map's toolbar, from an Incoming line, or from a
shelf. It replaced a modal that took ONE destination shelf for a whole delivery,
which was wrong for the commonest case — a mixed Easy Composites order is rolls
and jugs and consumables belonging on three different shelves.

Enter commits a line and opens the next one already carrying the class, shelf
and supplier, so a stock-take line is name, Tab, count, Enter. The class cell
offers Fabric / Resin / Hardener / Consumable, capturing the role the cure
buy-off filters on and the hazard the flammables check needs — the old flow
never asked, so every received lot was born unable to trigger any warning. The
confirm runs the chemical-storage checks against what each shelf *would* hold,
so a problem is caught before the write.

Quantity fans out by class, live as you type: 3 in a fabric row reads "3
records" before the keystroke finishes, because fabric and resin are tracked one
container per record, and the same 3 collapses to "1 record of 3" for a
consumable. A paste from an order email becomes rows you then correct by typing
— a prefill, never a mode. "Arrived" on an Incoming line seeds the *whole*
order.

Resin, hardener and consumable rows also take an **EH&S tag** — the UC barcode
sticker that campus EH&S puts on every chemical container for the RSS Chemicals
inventory. Chemicals have to wear the university's sticker, and one sticker per
carton means it doubles as the container's identity in this app: the code is
stored on the lot record, one tag per container, refused if another record
already wears it. A row fanning out to several jugs takes several codes,
space-separated, dealt to the records in order; the confirm warns when the
deal is short. Shelves can carry their RSS sublocation tag the same way, on
the BIN record.

The materials table (`materials.js`) knows what a material IS: name aliases
that map "AT30 SLOW EPOXY HARDENER" to the `AT30` key, the bundled TDS and SDS
for it, and the two numbers people used to walk to a laptop for — mix ratio
and shelf life — each read from the datasheet it cites, never guessed. A lot's
detail page shows the strip (ratio, shelf life, reorder threshold, TDS/SDS
buttons), a grouped row carries the ratio and the TDS, and receiving and the
EH&S import fill a blank material type from the aliases automatically. **Link
materials** on the Materials list backfills records imported before the table
existed: it proposes a key for every blank whose name matches, fills missing
expiry dates from received date plus shelf life (stamped "shelf-life table",
the enum value that finally has a table behind it), and touches nothing
already filled in.

An **EH&S barcode field** on a chemical or shelf record carries a camera
button in edit mode: scan the UC sticker instead of retyping 24 characters.
The same button on a receiving row appends tag after tag with the camera held
open, so a three-jug line is three scans into one cell. Scanned and typed
codes go through the same normalisation and the same one-tag-one-container
refusal.

**What a UC tag looks like**, from a photographed RFS label: a Data Matrix
square, the word RSS, and 24 characters of letters and digits printed as six
space-separated groups of four (`CA00 0000 0000 0000 0024 3EF0`). No dashes; a
dash in a stored code came from a person, not the tag. The last twelve
characters are reprinted rotated down the right edge, which is the copy that
survives a wrapped or scuffed label.

Three things follow from that. The app renders a code in the tag's own
grouping wherever it shows one, so screen and sticker can be walked together.
**Typing those twelve edge characters is enough to find a container**, in the
scan box, in Move, anywhere a code is accepted, provided exactly one record
wears them; if two do, the app names both and asks for more of the code rather
than opening one of them. And a code that is not 24 characters is flagged
rather than refused. It saves, with a note saying how many characters it has,
because the grammar comes from one photographed label, older hand-entered
codes are genuinely shorter, and refusing a code somebody is holding is how a
person decides the field is broken and leaves it blank.

For the containers EH&S tagged before this feature existed, **EH&S import** on
the Inventory toolbar (lead-only) takes the RSS web app's own .xlsx export,
parsed in the browser with no library — the export is a zip of XML, and
DecompressionStream has been in every supported browser since 2023. Pick the
sublocations that are ours (Formula Electric's start ticked, every other RSO's
start unticked), untick any individual container you deliberately do not track
— which is what keeps a re-import from resurrecting records you deleted — say
which shelf each sublocation maps to, and every remaining barcode the app does
not already know becomes a record: class and role guessed from the name,
hazard from the GHS H-codes (no codes stays honestly unknown), received and
expiry dates carried over. Import never edits and never deletes; a barcode
some record already wears is the same jug, not newer truth. The Export modal
gained an **EH&S reconciliation** sheet going the other way: every chemical
container with its barcode, untagged and emptied-but-still-in-RSS rows sorted
first. The sheet carries the code twice: `ehsBarcode` unpunctuated, so a
lookup against the RSS export lands, and `printed` in the tag's four-character
groups, for the half of the job done on foot with the sheet on a clipboard. A
code that is not 24 characters gets its own note, because it will miss the RSS
export and read as a container campus does not know about when the truth is a
typo.

After a submit you stay in the sheet with the caret in a fresh line, and the
labels are queued on the undo bar rather than auto-printed. Undo deletes what it
created and puts the lines back on the sheet.

Partial receipt works: six of ten arriving leaves four outstanding instead of
the line vanishing.

#### Running out

The reorder signal lives on the **material**, not on the jug. That is the fix
for PP-02 — the SN5 sheet where a "Running Low" flag sat unactioned all season —
and for a reason that had gone unnoticed: the flag lived on a container, and
when the last container emptied it dropped out of every count, so being nearly
out was a chip and being completely out was silence.

CS-011 §5's minimums are lead-editable, because §5 calls them "starting values;
tune with usage data". Supplier lead time turns "you are low" into "order by
2026-10-05", and a material already on its way reads *on order · BUY-SN6-040 ·
9d ago* instead of nagging for the whole six-week lead time — a nag that is
known-stale is how the SN5 flag became wallpaper in the first place. **Add to a
purchase** creates a Submitted `Restock` BUY-; when the delivery is received the
row disappears by itself.

How full a container is, is a coarse level — Full / Half / Low / Empty — not a
number, because a number nobody can measure goes stale silently and then nobody
trusts any of it. Consumables also carry a real count, because boxes are
countable.

#### Getting the data back out

**Export** on the map, and two rows of buttons under Reports: *Everything on
every shelf* (one row per physical thing, with the shelf's NAME, its warnings,
and a link back) and *Locations* (the stock-walk checklist). Both as a .csv
download or as **Copy for Sheets**, which puts tab-separated rows on the
clipboard to paste straight into a blank sheet — and works on a phone, where a
browser download often silently does nothing.

The records themselves: **materials** are fabric rolls and offcuts, resin and
hardener lots, and consumables, which is what makes "which roll went into this
panel" answerable; **items** are test panels (stack, coupon range, lot
references: the fix for tensile data whose only identity was a filename), jigs,
and the storage locations.

Above the map sits **Incoming** — everything bought but not yet on a shelf. It
is a query over the Budget tab's purchase lines, never a second copy of the
fact: a line shows here until a received record points back at it. Rows show the
thing, its unit price, the purchase chip, the vendor, and the order age (⚠ past
14 days). **Arrived** opens the Receive flow prefilled; saving creates the lot
already priced, dated, located and linked back to the purchase, and the row
leaves the strip. Walk-in deliveries (donations, legacy stock) still go through
the plain Receive button and stay honestly un-costed. The strip renders nothing
when nothing is in the mail.

Buyable things (fabric, resin, consumables, jigs, tooling boards) also carry a
**unit cost**: a real number of dollars, with a free-text cost unit ("ea", "yd",
"kg") beside it on lots. Prices show inline on shelf rows and in the Materials
list, so browsing the map teaches what things cost instead of that knowledge
living in whoever placed the order. A record created by receiving a purchase
carries a read-only "From purchase" chip back to the budget entry that bought
it. A missing cost renders as absent, never as $0.00.

### Reports

Reports does per-dataset CSV export for parts, work orders, projects and budget,
plus a one-click printable Monday-meeting status board, and it is where you
print labels in bulk. The board is a grid of cards: stage counts coloured the
way Parts colours them, and every work order, blocker and deadline a real link
into its record; on paper it prints one section under the next, chrome-free like
every other printout.

A lead also gets three one-off migrations there: **Find molds in work orders**
proposes a mold record per distinct free-text mold name and lets a human untick
the duplicates (no algorithm should decide that "MOLD-UT-INLET" and "UT INLET
MOLD" are the same mold); **Link parts to work orders** backfills the link the
SN5 data never had, on exact one-to-one name matches only; and **Rebuild scan
mirror** re-publishes the public nameplates. **Tracker feed** is the fourth, and
it is the one described next.

## The Google Sheet mirror

The team runs the season off the Composites Master Tracker in Drive. Until this
existed, adopting the app meant either abandoning the sheet everyone already
watches or typing every part twice, which was most of why switching to the app
felt like a chore. Now the spreadsheet mirrors the app on a fifteen-minute
timer. One direction: the app is the source of truth, and anything typed into
the synced columns of the target tab is overwritten on the next run.

A lead presses **Tracker feed** under Reports once, which mints a secret token
and publishes the first snapshot. The other half is a script that lives inside
the spreadsheet; install steps, the trial-tab rollout and the handover note are
in `06 Composites App/sheets/README.md`. Until both are done the feed URL 404s.

The token is the whole capability, the same way the Slack webhook next door is.
Anyone with the URL can read the season's part list including engineer names and
comment text, which is deliberate — the sheet has those columns, and a mirror
that dropped them would not be a mirror. **If the spreadsheet is ever set back
to restricted, revisit what the feed publishes in the same breath**, since the
case for publishing them leans on that data already being link-readable.

Staleness is not the failure mode it looks like. The app is the only place part
edits happen, so "nobody has had the app open" means the snapshot is stale and
correct. What the sheet cannot tell you on its own is whether the sync itself
died, which is why the script keeps a `Sync Log` tab with a timestamp per run.

Rows in the sheet the app has never heard of are left alone and tinted amber,
never deleted. Columns are matched by header text rather than position, so
inserting a column does not shift data into the wrong place, and column A's
countdown formula is never overwritten and is copied down onto appended rows.

## Labels

![The label sheet: IDs, key facts, QR codes, and the calibration bar](../design/labels-mockup-20260825.png)

Every physical thing gets a 4 x 1 inch label carrying its ID, its name, the fact
that actually identifies it, and a QR code that resolves to the record. On a
part that fact is the layup stack; on a mold it is the sealing record and the
number of parts pulled off it. The point is that the label answers "what is
this" with the phone still in your pocket, because RFS wifi drops and gloves are
covered in resin. Scanning is the fast path, not the only one.

There is a Label button on a work order, a part, a mold, a board, an item and a
lot, and a bulk builder under Reports.

### Two ways to print one

**On a sheet**, for seeding an inventory. The builder lets you pick Avery 5161
(20 up) or 5522 WeatherProof polyester for chemicals, and the cell to start at,
so a part-used sheet gets finished instead of binned. It also prints a 100 mm
calibration bar: browsers silently apply "Fit to page" scaling, and ten seconds
with a steel rule is cheaper than a wasted sheet of polyester.

**On a roll**, for every day after that. Once the shed is inventoried you need
one label at a time — a lot gets opened, a panel comes off the table, a bin gets
renamed — and printing one onto an Avery sheet wastes nineteen. The roll printer
is a Brother QL on the shed wifi; you print to it from the phone's own print
dialog over AirPrint, so there is no printer address to configure anywhere in
the app. If it doesn't show up in the dialog it is off the network.

The everyday stock is **DK-2210**, 29 mm continuous, cut at 101.6 mm — which is
the Avery 5161 cell to within a millimetre, so it is the same label on different
paper rather than a second design. **DK-1201** die-cut (29 x 90 mm) is there as
a fallback and is 15 mm shorter, so long names wrap one tier earlier.

Direct-thermal roll labels are for indoor bins, shelves, lots and consumables.
They fade in UV, blacken with heat and smear under solvent, so anything going
into a post-cure oven or getting wiped with IPA or acetone still gets a 5522
polyester label off the sheet printer. That is not a fallback; it is the right
stock for that job, and it is why the sheet path is not going away.

**Label media** under Reports sets which one this browser uses. It is stored on
the device, so the phone at the bench and a laptop at home can differ — which is
the point. A lead can also set the team default, which only seeds a device
nobody has configured.

### A label with nothing behind it

**Custom label**, under Inventory and Reports, prints typed text: a shelf edge, a
cabinet, a warning. Same type sizes and the same FEB mark as every other label,
with a live preview at print size, an optional QR, and the last ten kept for
reprinting.

It will not let you type something id-shaped into the second line. A hand-made
label reading `MOLD-SN6-011` that no record answers to is the exact failure this
whole system exists to end, and one that *does* match a record is refused too and
sends you to that record's own Label button — which prints the identifying fact
and a QR that resolves, instead of four words somebody remembered.

Coupons carry a QR like everything else. That was not always true: when a coupon
was a substring of a panel (`PNL-SN6-006-C03`, fifteen characters) it was one
over the QR budget and coupon labels were text-only. A coupon is now a
first-class R&D record — `CPN-SN6-042`, eleven characters, shorter than a mold.

## Scanning

![The public nameplate: what a phone camera opens, signed out](../design/scan-mockup-20260825.png)

Scanning a label with a plain phone camera opens a public nameplate that works
**with no account and no signal**. It paints immediately from the ID in the URL;
if the lookup succeeds it adds the name, stage, location and work order; if it
does not, it says so plainly rather than spinning forever. There is an "Open in
the app" button.

Working without an account is the point. A Jacobs staffer needs to know whose
mold is blocking the container, and adding them to the roster to answer that is
absurd.

That page cannot read the real records. It reads a separate mirror carrying nine
whitelisted fields: id, class, name, stage, location, work order, revision, a
note, and a timestamp. Everything on it is already printed on the physical
label, and the rules reject any write carrying anything else, so a bug cannot
publish a layup stack or somebody's email. The mirror keeps itself in step, and
a lead can re-publish everything with **Rebuild scan mirror** under Reports.

**Inside the app**, the topbar has a **Scan** button next to search. Chrome and
Android open the camera through the browser's own BarcodeDetector. iPhones have
no such API, so `scan-fallback.js` lazy-loads a vendored zxing-wasm decoder
(`vendor/zxing/`, 1MB fetched once, then cached) and installs it as a
`BarcodeDetector` polyfill; the first scan on an iPhone says "Loading the
scanner…" for a few seconds and every later one is instant. If the load fails,
or the browser has no camera at all, the typed-code field is still there. A
code resolves whether it arrives as the full URL, the bare code, lowercase, or
with whitespace round it, because somebody will retype it off a scuffed label.

The camera reads FEB's QR labels and the **UC EH&S tags** on chemical
containers. An RSS tag is a **Data Matrix** square — confirmed off a physical
sticker, 2026-08-29 — carrying a 24-character serial printed under it in groups
of four (`CA00 0000 0000 0000 0024 3EF0`); the detector is also asked for the
common linear formats in case an older sticker is one, which nobody has checked
yet. An EH&S tag resolves to the lot wearing it, by the whole serial or by the
twelve characters reprinted down the label's edge; a tag nobody has logged
offers to open the receiving desk with the code prefilled. RSS sublocation tags
on shelves resolve to the BIN record the
same way, so Move and "move things here" take either kind of label at either
end.

Every mold, item and lot detail page has **Move** outside edit mode; item and
lot pages also carry a stage button that names its destination ("Open", not
"Advance"), while a mold sets stage on the stepper described under Molds. Move
offers the storage records and can take the shelf by scan, so the sequence is:
scan the mold, tap Move, scan the shelf. That makes location a controlled
value, which is what CS-011 §7.3 says it needs to be. Advancing leaves an undo
bar.

## Which lots went in

The cure buy-off already asked what resin went in and when. It also asks which
fabric roll, which resin lot and which hardener lot, in the same modal, because
that is already the one moment somebody is standing at the part having just
mixed resin. A second prompt at the same instant is the one people learn to
dismiss.

The fields are **default-and-confirm, not select**: each is pre-filled with the
most recently opened lot of that class, which under CS-011's one-open-container
rule is the one physically on the bench. Right by default about 90% of the time
beats blank 100% of the time, at one tap instead of three scans. There is a scan
button beside each, and a scanned lot is recorded as verified rather than
remembered.

**"I don't know" is a valid answer.** This is the load-bearing decision. A gate
that can only be satisfied by naming a lot gets satisfied by naming the wrong
one: with two jugs on the bench at 11pm, someone scans the nearest, and the
record is then precise, confident and wrong. An honest gap is worth more. The
lots print on the traveler too, unflattering source and all.

## The R&D bench

**Archive a study** from the toolbar when it is open (batches under it follow).
It leaves the index and the "N archived studies" checkbox at the foot of the
index brings it back, with Restore in the same place.

**For coupons, not for parts.** Ten flat panels at two cure temperatures, six
infusion trials, a box of offcuts you want to keep track of. There is no work
order, no traveler, no revision and no buy-off — a coupon is a row, and the
whole tab is meant to be quicker than opening a spreadsheet. If it ever isn't,
say so, because that is the only thing it has to beat.

**A study is whatever you need it to be.** Give it a name and it is a folder.
Add a column and mark it a *setting you chose* and it becomes a test with a
variable. Put it inside another study and it becomes a batch in a project. It is
one record either way — there is nothing to pick when you make one, and nothing
to migrate when it grows.

**Ten coupons is three presses.** Open the study, set **Rows**, press **Add
rows**. They arrive numbered C01…C10, ready to type into. Labels never repeat:
if a create half-fails the numbering skips rather than reusing, because a gap is
invisible and two coupons both marked C03 in Sharpie is not.

**Columns are per study.** Name one, say whether it is an **input** (something
you chose) or a **result** (something you measured), give it a unit. Eight is
the limit — past that the grid gets wider than the screen, and the ninth column
is really a second study. Retiring a column hides it and keeps every value ever
measured into it.

**Compare turns itself on** once a study has an input, a result and three
coupons. It groups by the thing you varied and gives you the mean and the range
of what you got, plus how many coupons each number actually came from — a study
that is half-measured says so rather than averaging over whatever happened to
be filled in. Scrapped coupons are left out unless you ask for them.

**Paste fills, it does not create.** Copy a column of readings off the Instron,
click the first cell and paste: the values fill *down the rows already there*.
If there are more values than rows it stops and tells you how many had nowhere
to go. Nothing is minted by a paste.

**A project shows all its batches' coupons at once**, with a Batch column
saying where each came from, which is what lets a sweep run across two rounds.
Coupons themselves always live in a batch — a project holds batches, so the
**Add rows** button moves out of the way and says so.

**Everything gets a label.** The study's is for the bag, the tray or the box the
coupons live in — the thing you pick up in March wondering what it was. It
carries the study name, how many coupons should be inside, the materials and a
QR. Each coupon gets its own, and **Coupon labels** prints the whole study on one
sheet: you cut ten coupons and you want ten tags in one press. Both scan back to
the record like every other label in the app.

**Photos.** On the study, that's the panel before it was cut or the setup on the
machine. On a coupon it's almost always the **failure surface** — the one
photograph in coupon testing that is evidence rather than a record, because it's
what says whether a number is a real result or a grip that slipped. The camera
button on each row carries its photo count, so a coupon that has one is visible
while you scan down the column.

**Getting the data out**, three ways, because they're for three different
moments. **CSV** downloads one row per coupon with every column. **Copy** puts
the same thing on the clipboard as TSV to paste into a Google Sheet — which is
the one that works on a phone, where a browser download often silently does
nothing. **Report** prints a one-page sheet with the table, the comparison and
the photos, for a design review or the advisor. All three resolve what a coupon
*inherited*: a blank resin cell in a spreadsheet somebody opens next year is a
lie by omission, because the coupon did have a resin — it just took it from its
study.

**Duplicate** copies a study's setup and none of its results: same columns, same
materials, same label stem, no coupons, labels starting at 01 again. Same test,
new batch, next week — which is the normal case, not the exception.

**Delete** takes the coupons with it, after telling you how many. Undo puts
everything back *with its measurements* — an undo that restored the rows but not
the numbers would look like it worked. A project won't delete while it still
holds batches; that's three rounds of work, not one press.

**R&D parts are a different thing, and they are listed at the bottom.** A part
flagged R&D is a real part with a real traveler that just isn't a season
deliverable — a mold shakedown keeps every blocker and every cure hold. Those
live on the Parts tab; the R&D tab lists them so there is one place to look, and
every row opens over there.

## Opening the app

**The splash lays up the mark.** A cold load at RFS used to show a white page,
then an empty navy sidebar, then a bare card, so the app now paints its own mark
before any of its thirty-three scripts have run: a Berkeley-blue ply over a
California-gold one, arriving on the bias the way you actually lay a 45. Under
it sits the **fact of the day** — the same one the dashboard shows, drawn from
the team's own SN5 documentation.

**The start lights tell you what it is waiting on.** Five lamps under the
wordmark, filling as five real things land: the app's own code, sign-in, your
place on the roster, the first of the shop data, and the type. A line underneath
names whichever one is still outstanding. They are lit by what actually
finished, never by a timer — so when a load stalls at RFS you can see *which*
part stalled instead of watching a spinner.

**Nothing opens until you say so.** Once all five are lit the splash offers
**Continue** — a tap anywhere, or Enter, Space or Escape — and then it waits. It
does not leave on its own, so the fact under it is there for as long as you want
to read it rather than for however many seconds somebody budgeted. Press early
and the press is remembered rather than ignored; the app opens the moment it is
genuinely ready.

**Leaving is lights-out.** All five lamps go dark at once, the two plies part
along the bias they arrived on, and the sheet is drawn off on the 45 — the way a
ply comes off a mold — uncovering the app already in place beneath it.

If the connection is slow the splash says so after four seconds. If something is
genuinely broken, the lamp for that step goes hollow and amber, the line says
what went wrong in plain words, and the button changes to **Continue anyway**
with a **Retry** beside it. You are never locked out, and you are never told the
app loaded when it did not.

## Getting around

**Back goes back.** Records cross-link constantly, and Back returns one step
along the trail you actually took, across tabs, saying which record it is
returning to: open a ticket from a part and Back says the part. Picking a tab
from the sidebar ends the trail, since that is "take me elsewhere" rather than a
step.

**Cross-links are everywhere.** Click a chip to jump to the related record. A
part's layup stack and its linked work order's stack stay in sync, so edit
either one. Every record has a deep link you can paste to somebody.

**⌘K (Ctrl-K)** anywhere is global search. The bell collects @mentions, typed as
`@name` in a project comment, along with project assignments, and shows an
unread count. That is in-app only; there is no email.

**Light and dark.** It follows your system setting on first load and you can
flip it with the sun/moon button in the header (the ⋯ menu on a phone); the
choice is remembered. Printing always comes out black-on-white regardless.

**Phones and tablets.** The blue sidebar folds into a slide-in drawer behind the
☰ button, and at that width the account and lead actions (Backup, Restore,
Sign out) move into a ⋯ menu next to search and the bell. The wide list
tables turn into one card per row.

## Viewing as a guest

Anyone can open the app, press **View as guest** on the sign-in screen, and read
the whole thing. No account, no roster entry, nothing to ask a lead for.

**Nothing is editable, and the reason is the one the sign-up form has always
given**: a buy-off carries a name. So does a comment, a stage change, a
consumption log and a purchase. Read-only is not a limitation bolted onto guest
mode — it is what makes guest mode possible without breaking the thing this app
exists to do.

**Controls are shown, not hidden.** A guest sees the buy-off button, greyed, and
pressing it says *"Sign in to sign off on a step — a buy-off carries your
name."* That is deliberate: a hidden control teaches nothing, and the point of
handing somebody the app is to show them what it does. It is also deliberately
**not** the `disabled` attribute — Chrome dispatches no click and shows no
tooltip on a disabled control, so the reason would be unreachable on exactly the
phone this gets demoed from. The same judgement is already written down at two
other gated controls in this app, for the same reason.

**The dashboard is a different page**, not an emptier one: the season, the build
progress, and what the team is making. A work queue with everything filtered out
would be a blank apology.

**The rules are the boundary, not the buttons.** A guest signs in anonymously, so
`firestore.rules` can tell them apart: `read` is widened to them on the eleven
data collections and the roster, and every `create`/`update`/`delete` clause is
untouched — those all test `onRoster()`, which fails for a guest on its email
clause without ever mentioning guests. Two independent predicates say no. The
client refuses too, in `fb.js` and again in `core.js`, so a bug in any one of
the three still writes nothing.

Two things a guest cannot read, and both are credentials rather than data:
`config/slack` holds a live webhook URL, and `config/tracker` holds the token
that IS the security on the public feed. Config is an allowlist for that reason —
a key added next season is private until somebody decides otherwise.

**What this discloses, said out loud.** Team email addresses. Not through the
roster — through the records: `createdBy`, `updatedBy`, and every buy-off,
override and comment carries an address inside a document a guest can now read.
Closing the roster would not have withheld them; it would only have cost the app
names and photos. That was Simon's call, taken knowing this.

**Leaving.** Firebase persists an anonymous session, so a guest who taps once
would otherwise be auto-signed-in as that same anonymous user forever and never
see the login screen again. **Sign in** in the header signs out first.

## How access works

Anyone creates an account at the login page with a name, a username and a
password, and starts working straight away as a member (v4.4.0). No email is
needed; accounts made before v4.4.0 with a Berkeley email keep signing in with
it, since the sign-in box takes either. The rules in `../firestore.rules` let
an account create only its own roster entry, only as a member.

There are two roles. A `member` does all day-to-day work across every tab. A
`lead` can also delete records, restore from a backup file, load the SN5 archive
and manage the roster: only a lead makes someone a lead, on People.

Your display name is yours to change: **Change name** on your own row in
People. New buy-offs, assignments and comments carry the new name; old
signatures keep the name they were made with.

A username account has no mailbox, so there is no password reset for it. A
lead deletes the account in the Firebase console and the person signs up again
with the same username; the roster entry is keyed by that username, so their
name, role, trainings and every old signature reattach.

A lead who would rather not wear the label can tick **show me as member** on
their own row in People. Only the pill changes: the account menu drops the
"· lead" suffix and People lists them as a member, while every permission
stays. Other leads still see the real role in the dropdown on your People row.

When someone leaves the team, remove them from the roster. Since anyone can
join as a member, removal is a nudge rather than a lock: somebody who should
stay out needs their account disabled in the Firebase console as well.

Firebase Auth handles passwords, including hashing and reset emails. We never
see or store them, and "Forgot password" on the login page works on its own.

## What a buy-off is, and isn't

A work-order buy-off records who was signed in when the button was clicked:
name, email and timestamp, and since August 2026 it also records *what*. Steps
carry a rule saying what has to exist before they can be signed: a layup stack
before the stack can be frozen, the CAD attached or linked before a mold design
review, a written note on the machining and drop-test steps. Press Buy off
without it and the app says what is missing and gives you the button that fixes
it. A lead can sign anyway, and it costs a sentence that lands in the event log
next to what was missing — the same bargain as overriding a cure hold, and for
the same reason: a gate nobody can pass gets worked around outside the app,
which is worse, because then it isn't written down anywhere.

A photo is suggested and never required, on the steps that need a note. Half
these steps happen in a dark corner of RFS at eleven at night, and a hard photo
requirement is how you teach people to write the traveler up the next morning
from memory instead.

On the Parts tab, one stage value is gated the same way: setting CAD to "Mold
CAD/CAM Done" wants the mold CAD linked from Drive or attached as a PDF. That
one is a claim about a file, and a file either exists or it doesn't. The other
stages are claims about a physical object anyone in the shop can walk over and
check, so they stay one click with an undo bar.

Native CAD uploads to the Files section on a ticket, a work order or a part:
STEP, STP, SLDPRT, SLDASM, IGES, X_T, 3MF, F3D, DXF, DWG and STL, up to 50 MB
(everything else stays at 10 MB). A linked Drive document still satisfies every
check that wants "the CAD", and usually it's the better answer: a STEP file in
the app is a copy, while the Drive link is the thing everyone else can open and
edit.

All of that is much better than typed initials, but be honest about the limits,
and the same applies to every record in every tab. Nothing here is tamper-proof.
Any roster member can edit any record, and there's no version history inside the
app, so the monthly backup files in Drive are the audit trail.

Two mitigations are built in. Edits save per-field, so someone editing a BOM
can't clobber a buy-off saved at the same moment; the remaining race is two
people editing the same field of the same record at once, which is
last-write-wins. And "Reset steps", the one button that erases buy-offs
wholesale, is lead-only and warns before firing.

If a record ever looks wrong, that's a conversation, not a software bug.
Composites is a dozen-ish people who see each other twice a week.

The rules do genuinely enforce roster membership for everything, lead-only
deletes, lead-only roster changes, roster self-edits limited to avatar and name
so you can't promote yourself, and increment-only id counters.

## Files, photos, and watchers

Uploads (avatars, project files, comment images) live in Firebase Storage, which
requires the project to be on the Blaze plan. We set a Cloud Billing budget cap
so it can't surprise-bill, and real usage is a rounding error against the free
tier. Images are downscaled in the browser before upload, so a phone photo lands
at around 150 KB instead of 4 MB.

Comment rich text is sanitized before it's stored and again before it's shown,
so pasted scripts and handlers can't run for other viewers.

Descriptions are comments that happen to always be there, so they use the same
editor: click the text and write, no Edit button and no form. That covers a
ticket's description, an issue's What happened, a work order's notes, the part
note, a purchase's notes and the notes on a mold, an item or a lot. All of them
take photos, tables and pasted Google Docs.

Photos in the last three only started working in September 2026. The editor had
been wired up on the Shop tab for a season, but `storage.rules` had no rule for
`molds/`, `items/` or `lots/`, and a path with no rule is denied, so every
pasted photo failed at upload behind a toast that read like bad wifi. If you
tried this before and gave up, try it again.

Clicking a PDF in a file grid opens it in the app, in the same viewer the
Documents tab uses. The filename underneath it is still a download, because
reading a drawing and keeping a copy are different jobs.

Clicking a photo opens it full screen without leaving the app. The arrows walk
every photo on that record (the Files grid and the comment thread as one set),
and the download button saves it with its real filename. Swipe works too.

Watcher "new activity" is per-browser. It's tracked in your browser's local
storage, so the unread dot reflects when you last opened this on *this* device.
It isn't synced across devices and it isn't an email.

## One-time project setup

Already done for `feb-composites`. These steps are here for the next person who
has to stand it up again or move it to a team account, and take about 20
minutes.

Use a team Google account if at all possible, or add the next lead as an owner
the day you set it up. The failure mode to avoid is the Firebase project living
in a graduated senior's personal account.

1. At [console.firebase.google.com](https://console.firebase.google.com), Add
   project. Skip Analytics.
2. Build, then Authentication, Get started, Sign-in method, enable
   Email/Password.
3. Build, then Firestore Database, Create database, production mode, region
   `us-west1` or whatever's closest.
3b. Upgrade to the Blaze plan, needed for file and photo uploads: console, gear
   icon, Usage and billing, Modify plan, Blaze, add a card. Then cap it at
   [console.cloud.google.com](https://console.cloud.google.com), Billing,
   Budgets & alerts, Create budget of $1 to $5 with alerts at 50/90/100%. Then
   Build, Storage, Get started with the default rules, which `firebase deploy`
   overwrites with `storage.rules`.
3c. Give the bucket a CORS rule, once, from `06 Composites App/`:

   ```
   gcloud storage buckets update gs://feb-composites.firebasestorage.app --cors-file=cors.json
   ```

   **`firebase deploy` does not do this.** It pushes hosting and rules, and CORS
   is bucket configuration, so a deploy alone will not fix it. Without the rule
   the Molds tab's 3D plan view shows the stock blocks with no mold inside them.
   If you see blocks and no mold, the viewer says so underneath itself; that
   message is the one to act on.
4. Project settings, Your apps, the `</>` web option, register an app, then copy
   the config values into `firebase-config.js` here, replacing the demo values.
   Watch the variable name: the console hands you `const firebaseConfig = {…}`,
   but this app reads `window.FIREBASE_CONFIG`, so the line must start with
   `window.FIREBASE_CONFIG =`. If you see a "Not configured" screen, that's what
   happened. These values aren't secrets; the rules are the security.
5. On your laptop, `npm install -g firebase-tools`, then `firebase login`.
6. In `../`, the folder with `firebase.json`, set the project id in `.firebaserc`
   and run `firebase deploy`. That pushes both the rules and the site, to
   `https://<project-id>.web.app`.
7. Bootstrap the first lead. The roster starts empty and only leads can edit it,
   so it's chicken and egg: open the app, create your account, then in the
   Firebase console go to Firestore, Start collection, id `roster`, doc id set to
   your email exactly as you signed up in lowercase, with fields `name` (string)
   and `role` (string) set to `lead`. Hit "Check again" in the app.
8. Load SN5 archive from the header to bring in the retro work orders, parts and
   last season's timeline. Add the rest of the team to the roster and drop the
   link in #composites.

## Day-to-day

Nothing to run. Edits save automatically and show up live for everyone. If the
shop wifi drops, keep working, because writes queue locally and sync when it's
back. Two habits are worth keeping.

Back up monthly, using Backup in the header, into the team Drive. Firestore is
reliable, but a plain JSON file in Drive is the backup nobody can lock us out
of. Restore, which is lead-only, reads that file back.

Clean up the roster at handoff. The incoming lead gets `lead`, departed members
come off the list, and the new lead gets added as a project owner in the
Firebase console under Project settings, Users and permissions.

## Cost

On Blaze but effectively free. Firestore gives 50k reads and 20k writes per day
with 1 GB stored, and Storage gives 5 GB plus 1 GB/day egress. A heavy build day
is a few thousand reads, a few hundred writes, and a handful of photos. The
budget cap from setup step 3b is the safety net. The card is only there because
Storage requires it, and nothing here approaches paid usage.

## Working on the code

Everything runs offline against the Firebase emulators:

```
cd "06 Composites App"
firebase emulators:start --project demo-feb-work-orders
# app on http://localhost:5050, emulator UI on http://localhost:4000
```

The values in `firebase-config.js` auto-route to the emulators on localhost, so
you develop without touching production data. Emulator accounts and data are
throwaway. Create the bootstrap roster doc in the emulator UI's Firestore tab,
the same as step 7 above.

The test suites, the screenshot tools and what each one is for are in
`tools/README.md`. The decisions behind the app — why the folds are not
`<details>`, why routing never calls `pushState`, what the file map is, and the
rules for anything that touches a screen edge — are in `DESIGN-NOTES.md`. Read
that one before changing behaviour this file describes.
