# MDGA Audit Tool

On-demand audit for the MDGA federation. Captures one-or-more guild rosters
from the in-game addon, compares them against your Discord roster CSV and
the live website, and produces a categorized punch list of "who needs
what done."

This **replaces** the older Node companion app (`MDGA-companion.zip` /
`mdga-companion.exe`) for the audit workflow. The website still pulls
roster basics from the Blizzard API on its own — this tool fills the
gap for officer notes and main/alt detection that Blizzard hides.

## For officers (the dummy-proof path)

1. Download `mdga-audit.exe` from the dist folder.
2. Drop it anywhere — `Documents`, `Desktop`, wherever.
3. Make sure the **MDGA addon is installed and updated** in WoW.
4. Double-click `mdga-audit.exe`.
5. Follow the prompts. Switch characters between guilds when asked,
   click **Generate Report** in the in-game addon, then click **Reload**.
6. When done, the punch list prints to the console and a CSV report
   lands next to the .exe.

The tool needs no Python install. It reads `MDGA.lua` directly from your
WoW SavedVariables — no upload, no website credentials required (unless
you opt in to the website cross-check).

## What it checks

- **Mains who left in-game, alts orphaned** — finds officer notes like
  `"Warchief's Alt"` whose main no longer exists in any captured guild.
- **Broken alt-note syntax** — flags notes that contain "alt" but don't
  match the canonical `<MainName>'s Alt` pattern (your sheet's formulas
  depend on this).
- **Discord nick has no in-game match** — if you supply a Discord CSV.
- **In-game mains not in Discord** — Durotarian/Elwynnian rank holders
  with no Discord presence; candidates for demotion or invitation.
- **Website cross-check** — pulls the existing reconciliation reports
  (`guild-gaps`, `discord-orphans`, `spelling-mismatches`) from
  `mdga.gg` if you provide a token.

## Discord CSV format

The tool auto-detects columns by name. As long as your CSV has a column
that looks like one of these, it'll figure it out:

- **Username column:** `username`, `user`, `discord`, `discord_username`,
  `name`, or `member`
- **Nickname column:** `nickname`, `nick`, `display_name`, `character`,
  `character_name`, `ingame`, `in_game`

If your CSV uses different headers, rename them and re-export. (A future
version may support `--discord-username-col` / `--discord-character-col`
overrides.)

## For developers

Pure stdlib — no `pip install` needed to run from source.

```bash
# Run from source
python mdga_audit.py

# Build the .exe (requires PyInstaller)
pip install pyinstaller
pyinstaller --onefile --name mdga-audit --distpath dist --clean mdga_audit.py
```

The Lua parser is hand-rolled (port of `wow_addon/companion/lua-parser.js`)
so we don't depend on `slpp` or any third-party Lua library. WoW's
SavedVariables format is a constrained subset of Lua, fully covered.

## What this does NOT do (yet)

- **Apply fixes automatically.** It only lists what to change. The
  officer still does the in-game rank promotions, Discord nickname
  changes, and role swaps by hand. Auto-fix would require POSTing to
  Discord's API + `/api/reconciliation/*` endpoints — meaningful next
  step but not in MVP.
- **Read Google Sheets directly.** Export to CSV first.
- **Watch continuously.** It's a one-shot audit. Run it whenever you
  want to refresh the punch list.
