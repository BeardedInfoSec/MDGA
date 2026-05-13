"""
End-to-end smoke test for mdga_audit.
- Loads the two real Discord CSVs from the user's Downloads folder
- Builds a synthetic in-game roster with intentional issues so every check fires
- Runs audit() + write_xlsx_report()
- Prints the console punch list

Not bundled into the .exe — just a dev-side sanity check.
"""
from __future__ import annotations
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mdga_audit import (
    GuildSnapshot,
    audit,
    print_console_report,
    read_discord_csvs,
    write_xlsx_report,
)

DISCORD_DIR = r"C:\Users\abarbas\Downloads\discord"

def synthetic_in_game(discord_members) -> list[GuildSnapshot]:
    """Mimic a real scenario: officer captured ONE guild (MDGA-Tichondrius).
    To make the roster realistic we treat ~95% of Discord-Tichondrius users as
    in-game (matches the typical "almost everyone is in the roster" reality),
    then plant a few intentional issues to verify each check fires."""
    members: list[dict] = []

    # Pull Discord-Tichondrius members and use 95% of them as if they're in-game,
    # mirroring their Discord rank to in-game rank where we can.
    rng = __import__("random").Random(42)
    tich = [d for d in discord_members if d.realm_slug == "tichondrius" and d.is_main]
    keep = rng.sample(tich, k=int(len(tich) * 0.95))
    rank_from_role = {  # Discord rank role → (rankIndex, rankName)
        "Warchief":     (0, "Warchief"),
        "Warlord":      (1, "Warlord"),
        "War Council":  (2, "War Council"),
        "Marshal":      (1, "Warlord"),  # Alliance equivalents
        "Knight":       (5, "Knight"),
        "Guardian":     (6, "Guardian"),
        "Champion":     (6, "Champion"),
        "Honorbound":   (5, "Honorbound"),
        "Durotari":     (4, "The Durotari"),
        "Durotarian":   (7, "Durotarian"),
        "Elwynnian":    (7, "Elwynnian"),
    }
    for d in keep:
        # Pick the highest-tier Discord rank role they hold.
        best = (99, None)
        for role in d.roles:
            if role in rank_from_role:
                idx, name = rank_from_role[role]
                if idx < best[0]:
                    best = (idx, name)
        if best[1] is None:
            best = (7, "Durotarian")  # default to main rank
        members.append({
            "name": d.char_name.title(),
            "realmSlug": "tichondrius",
            "rankIndex": best[0],
            "rankName": best[1],
            "officerNote": "",
            "publicNote": "",
        })

    # Now plant issues so we can see each check fire.
    members.extend([
        {"name": "Lostalt",    "realmSlug": "tichondrius", "rankIndex": 8, "rankName": "Alt",
         "officerNote": "Bobtheorphanedmain's Alt", "publicNote": ""},
        {"name": "Sloppyalt",  "realmSlug": "tichondrius", "rankIndex": 8, "rankName": "Alt",
         "officerNote": "warchief alt", "publicNote": ""},
        {"name": "Inviteme",   "realmSlug": "tichondrius", "rankIndex": 7, "rankName": "Durotarian",
         "officerNote": "", "publicNote": ""},
        # Aelmaeggy realm-stays-tichondrius but we change rank to Champion → triggers sub-rank check
        # (real: he's Honorbound in Discord). Replace if already in keep.
    ])
    members = [m for m in members if not (m["name"].lower() == "aelmaeggy")]
    members.append({
        "name": "Aelmaeggy", "realmSlug": "tichondrius", "rankIndex": 6, "rankName": "Champion",
        "officerNote": "", "publicNote": "",
    })

    return [GuildSnapshot(
        guild_name="Make Durotar Great Again",
        realm_slug="tichondrius",
        captured_at=0,
        members=members,
    )]


def main() -> int:
    csvs = sorted(
        os.path.join(DISCORD_DIR, f)
        for f in os.listdir(DISCORD_DIR)
        if f.lower().endswith(".csv")
    )
    print(f"Loading Discord CSVs: {[os.path.basename(c) for c in csvs]}")
    members = read_discord_csvs(csvs)
    main_count = sum(1 for m in members if m.is_main)
    print(f"  → {len(members)} unique Discord members ({main_count} with main rank)\n")

    snapshots = synthetic_in_game(members)
    print(f"Synthetic in-game: {snapshots[0].guild_name} ({len(snapshots[0].members)} members)\n")

    findings = audit(snapshots, members, website=None)
    print_console_report(findings)

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_output.xlsx")
    write_xlsx_report(
        findings, out,
        capture_summary=[f"{s.guild_name} ({len(s.members)} members)" for s in snapshots],
        generated_by="admin (guildmaster)",
    )
    print(f"\n  Excel report → {out}\n")

    # Quick stats on the Discord-only checks (these are the most data-driven)
    by_cat = {}
    for f in findings:
        by_cat.setdefault(f.category, 0)
        by_cat[f.category] += 1
    print("Category counts:")
    for cat, n in sorted(by_cat.items(), key=lambda kv: -kv[1]):
        print(f"  {n:>5}  {cat}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
