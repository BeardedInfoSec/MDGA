# MDGA Audit Tool

A one-button audit for the MDGA federation. Captures live guild rosters from
the in-game addon, ingests the Discord roster exports from `#bot-spam`,
optionally cross-checks against the live website, and produces a categorized
Excel punch list of "who needs what done."

No Python install. No npm. No terminal commands. Officers double-click an
exe; on the next run they press Enter through every prompt because the tool
remembers everything.

---

## Quick start (officers)

### 1. One-time setup

1. Download **`mdga-audit.exe`** ([from `tools/mdga-audit/dist/`](dist/)) and
   put it anywhere you like — `Documents`, `Desktop`, a dedicated folder.
2. Make sure the **MDGA addon** (`wow_addon/MDGA.zip`) is installed in WoW
   and the version is **1.5.0 or newer**. The addon adds the in-game
   "Generate Report" button the audit tool relies on.
3. On <https://mdga.gg/profile>, scroll to the **MDGA Audit Tool** section
   (only visible to Guildmaster + admin), click **Generate Token**, then
   click **Copy**. The token is good for 90 days.

That's it. The tool will create everything else it needs the first time you
run it.

### 2. Each time you run an audit

1. **Grab the Discord exports.** In Discord → `#bot-spam` channel, download
   the latest two roster CSVs (one for `Durotarian`, one for `Elwynnian`).
2. **Drop both files into `discord-reports/`** (in the same folder as the
   exe). The tool creates this folder for you on first launch.
3. **Double-click `mdga-audit.exe`.**
4. The wizard asks how many guilds you'll capture. For each one:
   - Log into a character in that guild.
   - Open the MDGA addon → **Tools** tab → click **Generate Report (CSV)**.
   - When the popup appears, click **Reload**.
   - The tool detects the `/reload`, captures the roster (with officer
     notes), and prompts you to switch to the next guild.
5. Optional: when asked, paste your token to also pull the website's
   reconciliation reports.
6. The audit runs. The console prints a summary; the full Excel report
   lands in `archive/<date_time>/MDGA_audit.xlsx`.

After the run, `discord-reports/` is empty (the CSVs were moved into the
run's archive folder), so you know exactly what to do next time: drop two
fresh CSVs in, double-click.

---

## Folder layout

The tool is self-organizing. After the first run, the layout next to the
exe looks like this:

```
mdga-audit/
├── mdga-audit.exe
├── mdga-audit-config.json     ← saved settings (WoW path, account, token, …)
├── discord-reports/           ← drop the two bot CSVs here before each run
└── archive/                   ← every run lands here, timestamped
    └── 2026-05-13_152030/
        ├── MDGA_audit.xlsx    ← the Excel report
        ├── wow/               ← snapshot JSONs of each captured guild roster
        │   ├── snapshot_Make_Durotar_Great_Again_tichondrius.json
        │   ├── snapshot_Make_Durotar_Great_Again_thrall.json
        │   └── …
        └── discord/           ← the bot CSVs that fed this run
            ├── 1323850152204570644.csv
            └── 1358566325349257467.csv
```

The `archive/` folder is your run history. Old runs aren't deleted — keep
them as long as you want for week-over-week comparison.

---

## What the report looks like

The Excel workbook has two sheets:

### Summary
- Generated timestamp + the officer who ran it (decoded from your token)
- List of captured guilds and their member counts
- Findings-by-category counts, sorted with action items first; severity is
  color-coded (red = action, amber = warn, blue = info)

### Findings
A real Excel table named `AuditFindings` — sortable, filterable, banded
rows out of the box. Columns:

| Column | What it is |
|---|---|
| Category | Which check produced the row (see "Checks" below) |
| Severity | ACTION (do something) / WARN (look at this) / INFO (FYI) |
| Character | The character name involved |
| Realm | Realm slug (e.g. `tichondrius`, `moon-guard`) |
| Detail | Specific finding + suggested fix |

---

## Checks the tool runs

| Check | Severity | What it catches |
|---|---|---|
| **Main left, alts orphaned** | ACTION | Officer note `Warchief's Alt` exists, but `Warchief` isn't in any captured guild. Promote one of their alts and rewrite the notes. |
| **Broken alt-note syntax** | WARN | Officer note contains "alt" but doesn't match the canonical `<MainName>'s Alt` pattern. Sheet formulas rely on exact syntax. |
| **Realm mismatch (Discord nick vs in-game)** | ACTION | Discord nick says `Char-Tichondrius` but their in-game character is on Area-52 — server transfer not reflected in Discord. |
| **Discord Durotarian/Elwynnian not in any captured guild** | ACTION | User has the main role in Discord but isn't in the guild roster on the realm their nick claims. Demote to MDGA Friend or remove. |
| **In-game main not in Discord** | ACTION | Durotarian/Elwynnian in-game but no matching Discord member at all. Invite them or demote. |
| **Discord rank doesn't match in-game (demoted)** | ACTION | In-game rank is Alt or Trial but Discord still shows them as a main. Demote in Discord. |
| **Discord rank doesn't match in-game** | WARN | Their actual in-game rank isn't in their set of Discord rank-tier roles. Promote in-game OR adjust Discord. |
| **Discord nick missing character format** | WARN | Discord nick isn't in `Charname-Realm` shape, so we can't match it to anyone. Fix the nickname. |
| **Discord members on realms we didn't scan** | INFO | Bucketed count of Discord members whose nick realm isn't one we captured. Re-run with that guild captured to convert to ACTION items. |
| **Website report counts** | INFO | If you provided a token, surfaces row counts from `/api/reports/guild-gaps`, `/api/reports/discord-orphans`, `/api/reports/spelling-mismatches`. |

---

## Common questions

**Do I have to /reload every guild every time?**
Yes — that's how Blizzard's SavedVariables work. The addon writes its data
to disk only on `/reload` or logoff. The tool watches the file and detects
each write.

**Can I capture more than one guild without exiting the tool?**
Yes. Tell it "3 guilds" at the start, and it'll prompt you to log into
each one in turn. Capture order doesn't matter.

**What if the same character is in multiple federation guilds?**
A character can only be in one guild at a time. If you want to capture
multiple guilds, you need a character in each one (or different accounts).

**Where do officer notes come from?**
The in-game addon. Blizzard's web API does NOT expose officer notes — only
an in-game player with the "View Officer Notes" permission can see them.
The audit tool reads them out of `MDGA.lua` after `/reload`.

**The tool says "Discord members on realms we didn't scan: 547".**
That's expected — Discord members on realms you haven't captured yet show
up here as a single bucketed INFO line. Run with `/reload` in those
guilds to convert these to actionable findings.

**The tool says my token is invalid / expired.**
Tokens are good for 90 days. Generate a new one on the Profile page and
either paste it next time the wizard asks, or run `mdga-audit.exe --reconfigure`
to wipe the saved one.

**How do I change the saved settings?**
Run `mdga-audit.exe --reconfigure` from a terminal, OR delete
`mdga-audit-config.json` next to the exe and re-run normally.

**Can I re-audit a past run without /reload-ing again?**
Not yet directly, but the snapshot JSONs in `archive/<run>/wow/` have all
the data — a future flag could re-audit from those.

---

## For developers

Pure stdlib for parsing + capture; uses `openpyxl` for the Excel writer.
Bundled into a single .exe via PyInstaller.

```bash
# Run from source
pip install openpyxl
python mdga_audit.py

# Build the .exe (requires PyInstaller + openpyxl)
pip install pyinstaller openpyxl
pyinstaller --onefile --name mdga-audit --collect-submodules openpyxl \
  --distpath dist --workpath build --specpath build --clean mdga_audit.py
```

The Lua parser is hand-rolled — no dependency on `slpp` or another Lua
library. WoW's SavedVariables format is a constrained subset of Lua,
fully covered by the parser at the top of `mdga_audit.py`.

Realm slugs from Discord nicknames (`Lightning'sBlade`, `Mal'Ganis`,
`MoonGuard`, …) are normalized into Blizzard's slug format
(`lightnings-blade`, `malganis`, `moon-guard`) by the `normalize_realm()`
function. Add new edge cases to the `REALM_ALIASES` dict at the top.

### Test harness

`test_run.py` exercises the audit logic end-to-end against real Discord
CSVs + a synthetic in-game roster (no live `/reload` required). Useful
for verifying logic changes without firing up WoW.

```bash
python -X utf8 test_run.py
```

---

## What this does NOT do (yet)

- **Apply fixes automatically.** It only lists what to change. Officer
  still does in-game rank promotions and Discord nickname/role changes by
  hand. Auto-fix would require POSTing to Discord's API and the website's
  `/api/reconciliation/*` endpoints — meaningful follow-up but not MVP.
- **Read Google Sheets directly.** Export to CSV first.
- **Watch continuously.** One-shot audit per run. Designed to be re-run
  weekly (or on demand).
