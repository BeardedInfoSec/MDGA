"""
MDGA Audit Tool
================================================
On-demand audit for the MDGA federation. Walks an officer through
capturing one-or-more guild rosters from the in-game addon, ingests
a Discord roster CSV, optionally pulls the live website roster,
then prints a categorized punch list and writes a CSV report.

Pure stdlib (no pip install needed). Built into a single .exe via
PyInstaller for non-technical officers.

Run:  python mdga_audit.py
Build: pyinstaller --onefile --name mdga-audit mdga_audit.py
"""
from __future__ import annotations

import csv
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

VERSION = "1.2.0"
DEFAULT_SERVER = "https://mdga.gg"

# ──────────────────────────────────────────────────────────────────
# Lua parser (port of wow_addon/companion/lua-parser.js)
# Recursive-descent. No eval. Handles tables, strings, numbers,
# booleans, nil, line + block comments. Sufficient for WoW
# SavedVariables (which is a constrained subset of Lua).
# ──────────────────────────────────────────────────────────────────


class LuaParseError(Exception):
    pass


class LuaParser:
    def __init__(self, source: str):
        self.src = source
        self.pos = 0
        self.n = len(source)

    def _peek(self) -> str:
        return self.src[self.pos] if self.pos < self.n else ""

    def _advance(self) -> str:
        ch = self.src[self.pos]
        self.pos += 1
        return ch

    def _expect(self, ch: str) -> None:
        if self._peek() != ch:
            raise LuaParseError(f"Expected '{ch}' at pos {self.pos}, got '{self._peek()}'")
        self._advance()

    def _skip_ws(self) -> None:
        while self.pos < self.n:
            ch = self.src[self.pos]
            if ch in " \t\r\n":
                self.pos += 1
                continue
            # Comments: -- line, --[[ block ]]
            if ch == "-" and self.pos + 1 < self.n and self.src[self.pos + 1] == "-":
                self.pos += 2
                if self.pos + 1 < self.n and self.src[self.pos] == "[" and self.src[self.pos + 1] == "[":
                    self.pos += 2
                    while self.pos + 1 < self.n:
                        if self.src[self.pos] == "]" and self.src[self.pos + 1] == "]":
                            self.pos += 2
                            break
                        self.pos += 1
                else:
                    while self.pos < self.n and self.src[self.pos] != "\n":
                        self.pos += 1
                continue
            break

    def parse_file(self) -> dict[str, Any]:
        """Parse a SavedVariables file into a dict of top-level globals."""
        result: dict[str, Any] = {}
        self._skip_ws()
        while self.pos < self.n:
            name = self._read_identifier()
            self._skip_ws()
            self._expect("=")
            self._skip_ws()
            result[name] = self._read_value()
            self._skip_ws()
        return result

    def _read_identifier(self) -> str:
        start = self.pos
        while self.pos < self.n and (self.src[self.pos].isalnum() or self.src[self.pos] == "_"):
            self.pos += 1
        if start == self.pos:
            raise LuaParseError(f"Expected identifier at pos {self.pos}")
        return self.src[start:self.pos]

    def _read_value(self) -> Any:
        self._skip_ws()
        ch = self._peek()
        if ch == "{":
            return self._read_table()
        if ch in '"\'':
            return self._read_string(ch)
        if ch == "[":
            # Long-bracket string [[...]] or [=[...]=]
            return self._read_long_string()
        if ch == "-" or ch.isdigit():
            return self._read_number()
        # keyword: true / false / nil
        kw = self._read_identifier()
        if kw == "true":
            return True
        if kw == "false":
            return False
        if kw == "nil":
            return None
        raise LuaParseError(f"Unexpected keyword '{kw}' at pos {self.pos}")

    def _read_string(self, quote: str) -> str:
        self._expect(quote)
        out: list[str] = []
        while self.pos < self.n:
            ch = self._advance()
            if ch == quote:
                return "".join(out)
            if ch == "\\" and self.pos < self.n:
                esc = self._advance()
                out.append({"n": "\n", "r": "\r", "t": "\t",
                            "\\": "\\", "'": "'", '"': '"',
                            "0": "\0"}.get(esc, esc))
            else:
                out.append(ch)
        raise LuaParseError("Unterminated string")

    def _read_long_string(self) -> str:
        # [[...]] or [=...=[...]=...=]
        self._expect("[")
        eq_count = 0
        while self._peek() == "=":
            self._advance()
            eq_count += 1
        self._expect("[")
        closer = "]" + ("=" * eq_count) + "]"
        end = self.src.find(closer, self.pos)
        if end < 0:
            raise LuaParseError("Unterminated long string")
        s = self.src[self.pos:end]
        self.pos = end + len(closer)
        # Lua long strings drop a leading newline if present
        if s.startswith("\n"):
            s = s[1:]
        return s

    def _read_number(self) -> int | float:
        start = self.pos
        if self._peek() == "-":
            self._advance()
        # Hex
        if self.src[self.pos:self.pos + 2] in ("0x", "0X"):
            self.pos += 2
            while self.pos < self.n and self.src[self.pos] in "0123456789abcdefABCDEF":
                self.pos += 1
            return int(self.src[start:self.pos], 16)
        while self.pos < self.n and (self.src[self.pos].isdigit() or self.src[self.pos] in ".eE+-"):
            ch = self.src[self.pos]
            # don't gobble trailing - that's a separator
            if ch in "+-" and self.pos > start and self.src[self.pos - 1] not in "eE":
                break
            self.pos += 1
        text = self.src[start:self.pos]
        try:
            if "." in text or "e" in text or "E" in text:
                return float(text)
            return int(text)
        except ValueError:
            raise LuaParseError(f"Invalid number '{text}' at pos {start}")

    def _read_table(self) -> dict[Any, Any] | list[Any]:
        self._expect("{")
        self._skip_ws()
        result_dict: dict[Any, Any] = {}
        next_array_idx = 1
        is_array = True
        while self._peek() != "}":
            self._skip_ws()
            key: Any = None
            # ["key"] = value  OR  [123] = value  OR  identifier = value
            if self._peek() == "[":
                self._advance()
                self._skip_ws()
                key = self._read_value()
                self._skip_ws()
                self._expect("]")
                self._skip_ws()
                self._expect("=")
                self._skip_ws()
                is_array = False
            else:
                # try identifier = value (key lookup), else positional value
                save = self.pos
                # peek for identifier
                if self.src[self.pos].isalpha() or self.src[self.pos] == "_":
                    ident_start = self.pos
                    while self.pos < self.n and (self.src[self.pos].isalnum() or self.src[self.pos] == "_"):
                        self.pos += 1
                    ident_end = self.pos
                    self._skip_ws()
                    if self._peek() == "=":
                        key = self.src[ident_start:ident_end]
                        self._advance()  # consume =
                        self._skip_ws()
                        is_array = False
                    else:
                        # not an assignment; rewind and treat as value
                        self.pos = save
                        key = next_array_idx
                        next_array_idx += 1
                else:
                    key = next_array_idx
                    next_array_idx += 1
            value = self._read_value()
            result_dict[key] = value
            self._skip_ws()
            if self._peek() in ",;":
                self._advance()
                self._skip_ws()
        self._expect("}")
        # If purely positional 1..N, return list (more Pythonic)
        if is_array and result_dict and all(k == i + 1 for i, k in enumerate(sorted(result_dict.keys()))):
            return [result_dict[k] for k in sorted(result_dict.keys())]
        return result_dict


def parse_lua_file(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    # Strip BOM if present
    if src.startswith("﻿"):
        src = src[1:]
    return LuaParser(src).parse_file()


# ──────────────────────────────────────────────────────────────────
# WoW install detection
# ──────────────────────────────────────────────────────────────────

DEFAULT_WOW_PATHS = [
    r"C:\Program Files (x86)\World of Warcraft\_retail_",
    r"C:\Program Files\World of Warcraft\_retail_",
    r"D:\World of Warcraft\_retail_",
    r"D:\Program Files (x86)\World of Warcraft\_retail_",
]


def detect_wow_path() -> str | None:
    """Standard install paths first (most common); registry only as a fallback so
    that a stray Battle.net registry entry pointing at a private-server launcher
    (e.g. Ascension) doesn't beat out a perfectly good retail install."""
    for p in DEFAULT_WOW_PATHS:
        if os.path.isdir(p):
            return p
    if sys.platform == "win32":
        for key in [
            r"HKLM\Software\Wow6432Node\Blizzard Entertainment\World of Warcraft",
            r"HKLM\Software\Blizzard Entertainment\World of Warcraft",
        ]:
            try:
                out = subprocess.run(
                    ["reg.exe", "query", key, "/v", "InstallPath"],
                    capture_output=True, text=True, timeout=5
                )
                if out.returncode == 0:
                    m = re.search(r"InstallPath\s+REG_SZ\s+(.+)", out.stdout)
                    if m:
                        base = m.group(1).strip().rstrip("\\")
                        retail = os.path.join(base, "_retail_")
                        # Only trust a registry hit that actually looks like retail WoW.
                        if os.path.isfile(os.path.join(retail, "Wow.exe")):
                            return retail
                        if os.path.isfile(os.path.join(base, "Wow.exe")):
                            return base
            except Exception:
                pass
    # Last resort: hand back the canonical default even if it doesn't exist on
    # this machine, so the wizard prompt shows a sensible suggestion.
    return DEFAULT_WOW_PATHS[0]


def list_account_folders(wow_path: str) -> list[str]:
    acct_dir = os.path.join(wow_path, "WTF", "Account")
    if not os.path.isdir(acct_dir):
        return []
    return sorted(
        d for d in os.listdir(acct_dir)
        if os.path.isdir(os.path.join(acct_dir, d)) and not d.startswith(".")
    )


# ──────────────────────────────────────────────────────────────────
# Multi-guild capture flow
# ──────────────────────────────────────────────────────────────────


@dataclass
class GuildSnapshot:
    """One captured guild roster from a /reload-flushed SavedVariables."""
    guild_name: str
    realm_slug: str | None
    captured_at: int
    members: list[dict[str, Any]] = field(default_factory=list)


def watch_for_capture(sv_path: str, baseline_mtime: float, timeout_sec: int = 600) -> GuildSnapshot | None:
    """Block until SV file is rewritten with a fresh pendingReport, then return it."""
    deadline = time.time() + timeout_sec
    last_print = 0.0
    while time.time() < deadline:
        try:
            mtime = os.path.getmtime(sv_path)
        except FileNotFoundError:
            mtime = 0
        now = time.time()
        if now - last_print > 30:
            remaining = int(deadline - now)
            print(f"  ... waiting for /reload (timeout in {remaining}s)")
            last_print = now

        if mtime > baseline_mtime + 0.5:  # 0.5s grace for filesystem rounding
            # File changed — give chokidar-style settle time then parse
            time.sleep(2.0)
            try:
                data = parse_lua_file(sv_path)
            except (LuaParseError, OSError) as e:
                print(f"  ! Parse failed: {e}. Waiting for next /reload...")
                baseline_mtime = mtime
                continue

            mdga = data.get("MDGA_Data") or {}
            report = mdga.get("pendingReport") if isinstance(mdga, dict) else None
            if not report:
                print("  ! SV updated but no pendingReport found. Did you click 'Generate Report' before /reload?")
                baseline_mtime = mtime
                continue

            roster = report.get("roster") or []
            if not isinstance(roster, list):
                roster = list(roster.values()) if isinstance(roster, dict) else []
            guild_info = report.get("guildInfo") or {}
            guild_name = guild_info.get("name") or "Unknown Guild"
            # realm slug: take from first member
            realm_slug = None
            for m in roster:
                if isinstance(m, dict) and m.get("realmSlug"):
                    realm_slug = m["realmSlug"]
                    break

            return GuildSnapshot(
                guild_name=str(guild_name),
                realm_slug=realm_slug,
                captured_at=int(report.get("generatedAt") or time.time()),
                members=[m for m in roster if isinstance(m, dict)],
            )
        time.sleep(2.0)
    return None


# ──────────────────────────────────────────────────────────────────
# Discord roster CSV (the format produced by your bot in #bot-spam)
# ──────────────────────────────────────────────────────────────────
#
# The bot exports two CSVs (one per main-rank role: Durotarian + Elwynnian)
# with this schema:
#   "User", "ID", "Nickname", "@everyone", <role_1>, <role_2>, ..., <role_N>
# Each role column is empty for users without the role, or contains the role
# name verbatim for users with it. Nickname is "Charname-Realm".
#
# Roles we care about for the audit (in-game rank ↔ Discord role):
MAIN_ROLES = {"Durotarian", "Elwynnian"}                       # full member
SUB_MAIN_ROLES = {"MDGA Friend"}                               # social-only
GAME_RANK_ROLES = {                                            # mirror of in-game ranks
    "Warchief", "Warlord", "War Council", "RWC",
    "Marshal", "Knight", "Guardian", "Champion",
    "Honorbound", "Durotari", "Sapphire",
}
SKIP_ROLE_COLUMNS = {                                          # bot infrastructure / not ranks
    "User", "ID", "Nickname", "@everyone",
    "WoW Blue Post Tracker", "Message Scheduler", "StickyBot",
    "VoiceMaster", "Verification Bot V2", "MemberList",
    "Guilds of WoW", "verifications", "Open Ticket",
    "Raid-Helper", "Pancake", "Fight Club", "RBG Captain", "RBG1",
    "carl-bot", "PvP Coach", "FROST GOD BEOND", "Server Booster",
    "MEGA Jr Officer", "MDGA Jr Officer 3", "MDGA Jr Officer 2",
    "MDGA Jr Officer 1", "Ticket Tool", "Support",
}


@dataclass
class DiscordMember:
    user: str           # Discord username (e.g. "joobies1123")
    user_id: str        # Discord snowflake
    nickname: str       # raw nickname field
    char_name: str      # parsed character name (lowercased)
    realm_slug: str     # parsed realm slug (Blizzard format: "tichondrius", "zuljin", "moon-guard"...)
    roles: set[str]     # all Discord roles this user has

    @property
    def main_role(self) -> str | None:
        for r in MAIN_ROLES:
            if r in self.roles:
                return r
        return None

    @property
    def is_main(self) -> bool:
        return bool(self.main_role)


# Realms whose Blizzard slug doesn't follow the mechanical rules. Keys are the
# normalized output of the algorithm; values are the actual Blizzard slug.
# (Add to this as new mismatches surface in audit reports.)
REALM_ALIASES = {
    "area52": "area-52",
    "wyrmrestaccord": "wyrmrest-accord",
    "forgottencoast": "the-forgotten-coast",
    "blacksgridge": "blackrock",  # placeholder example
}


def normalize_realm(realm_text: str) -> str:
    """Convert Discord nickname realm chunk (`Tichondrius` / `Mal'Ganis` / `MoonGuard` /
    `Lightning'sBlade`) into the Blizzard slug format (`tichondrius` / `malganis` /
    `moon-guard` / `lightnings-blade`).

    Strategy: insert hyphens at camelCase boundaries FIRST (so apostrophes act as
    barriers and don't create spurious hyphens — `Mal'Ganis` stays one word), THEN
    strip apostrophes, then apply the alias table for known oddballs."""
    if not realm_text:
        return ""
    s = realm_text
    # Insert hyphens at camelCase boundaries while apostrophes are still in place.
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", "-", s)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "-", s)
    # Now collapse apostrophes (don't hyphenate them).
    s = s.replace("'", "").replace("’", "")
    s = s.lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9-]", "", s)
    return REALM_ALIASES.get(s, s)


def parse_discord_nickname(nick: str) -> tuple[str, str]:
    """`Polychange-Tichondrius` → ('polychange', 'tichondrius').
    Falls back to (raw_lower, '') when the nick doesn't follow the format."""
    if not nick or "-" not in nick:
        return (nick.lower().strip(), "")
    name_part, _, realm_part = nick.rpartition("-")
    return (name_part.strip().lower(), normalize_realm(realm_part.strip()))


def read_discord_csv(path: str) -> list[DiscordMember]:
    members: list[DiscordMember] = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            roles: set[str] = set()
            for col, val in row.items():
                if not col or col in SKIP_ROLE_COLUMNS:
                    continue
                if (val or "").strip():
                    roles.add(col.strip())
            nick = (row.get("Nickname") or "").strip()
            char, realm = parse_discord_nickname(nick)
            members.append(DiscordMember(
                user=(row.get("User") or "").strip(),
                user_id=(row.get("ID") or "").strip(),
                nickname=nick,
                char_name=char,
                realm_slug=realm,
                roles=roles,
            ))
    return members


def read_discord_csvs(paths: list[str]) -> list[DiscordMember]:
    """Combine multiple CSV exports (e.g. Durotarian + Elwynnian filters) into one
    de-duplicated list keyed by Discord user ID — same user shows up in both exports
    if they hold both roles, but we want one row per user with both roles merged."""
    by_id: dict[str, DiscordMember] = {}
    for p in paths:
        for m in read_discord_csv(p):
            if not m.user_id:
                continue
            if m.user_id in by_id:
                by_id[m.user_id].roles |= m.roles
            else:
                by_id[m.user_id] = m
    return list(by_id.values())


# ──────────────────────────────────────────────────────────────────
# Website client (optional)
# ──────────────────────────────────────────────────────────────────


def fetch_json(url: str, token: str, timeout: int = 30) -> Any:
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": f"mdga-audit/{VERSION}",
    })
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return json.load(resp)


def fetch_website_audit_data(server_url: str, token: str) -> dict[str, Any]:
    """Pull the existing reconciliation reports from mdga.gg for cross-checks."""
    base = server_url.rstrip("/")
    out: dict[str, Any] = {"guild_gaps": [], "discord_orphans": [], "spelling_mismatches": [], "errors": []}
    for slug, key in [
        ("guild-gaps?export_all=true", "guild_gaps"),
        ("discord-orphans?export_all=true", "discord_orphans"),
        ("spelling-mismatches?export_all=true", "spelling_mismatches"),
    ]:
        try:
            data = fetch_json(f"{base}/api/reports/{slug}", token)
            # endpoints return varying shapes — store raw for now
            if isinstance(data, dict):
                out[key] = data.get("rows") or data.get("results") or data.get("data") or []
            elif isinstance(data, list):
                out[key] = data
        except urllib.error.HTTPError as e:
            out["errors"].append(f"{key}: HTTP {e.code} — {e.reason}")
        except Exception as e:
            out["errors"].append(f"{key}: {e}")
    return out


# ──────────────────────────────────────────────────────────────────
# Audit logic
# ──────────────────────────────────────────────────────────────────

ALT_NOTE_RE = re.compile(r"^(?P<main>[A-Za-z'\-]+)['’]s\s*alt\s*$", re.IGNORECASE)
MAIN_RANK_NAMES = {"DUROTARIAN", "ELWYNNIAN"}


@dataclass
class Finding:
    category: str
    character: str
    realm: str
    detail: str
    severity: str = "info"  # info / warn / action

    def as_row(self) -> dict[str, str]:
        return {
            "Category": self.category,
            "Severity": self.severity,
            "Character": self.character,
            "Realm": self.realm,
            "Detail": self.detail,
        }


def audit(
    snapshots: list[GuildSnapshot],
    discord_members: list[DiscordMember] | None,
    website: dict[str, Any] | None,
) -> list[Finding]:
    findings: list[Finding] = []

    # Flatten in-game roster across all captured guilds.
    in_game: list[dict[str, Any]] = []
    main_index: dict[str, dict[str, Any]] = {}  # name lower → main char dict
    alt_pointers: list[tuple[dict[str, Any], str]] = []  # (alt_char, claimed_main_name_lower)
    by_char_realm: dict[tuple[str, str], dict[str, Any]] = {}
    for snap in snapshots:
        for m in snap.members:
            entry = dict(m)
            entry["_guild"] = snap.guild_name
            in_game.append(entry)
            char = (m.get("name") or "").lower()
            realm = (m.get("realmSlug") or "").lower()
            by_char_realm[(char, realm)] = entry
            rank_name = (m.get("rankName") or "").upper().strip()
            if rank_name in MAIN_RANK_NAMES:
                main_index[char] = entry
            mm = ALT_NOTE_RE.match(m.get("officerNote") or "")
            if mm:
                alt_pointers.append((entry, mm.group("main").lower()))

    # CHECK 1: Mains who left in-game but their alts remain.
    orphaned_mains: dict[str, list[dict[str, Any]]] = {}
    for alt, main_name in alt_pointers:
        if main_name not in main_index:
            orphaned_mains.setdefault(main_name, []).append(alt)
    for main_name, alts in sorted(orphaned_mains.items()):
        alt_names = ", ".join(f"{a.get('name','?')}-{a.get('realmSlug','?')}" for a in alts)
        findings.append(Finding(
            category="Main left, alts orphaned",
            character=main_name.title(),
            realm="(left)",
            detail=f"{len(alts)} alt(s) need promotion or note rewrite: {alt_names}",
            severity="action",
        ))

    # CHECK 2: Officer-note alt syntax.
    for m in in_game:
        note = (m.get("officerNote") or "").strip()
        if note and "alt" in note.lower() and not ALT_NOTE_RE.match(note):
            findings.append(Finding(
                category="Broken alt-note syntax",
                character=m.get("name", "?"),
                realm=m.get("realmSlug", "?"),
                detail=f'Note: "{note}"  →  expected "<MainName>\'s Alt"',
                severity="warn",
            ))

    # CHECK 3-6: Discord cross-checks (only if a Discord roster was supplied).
    if discord_members:
        # Index Discord by (char, realm) and by char-only fallback.
        discord_by_char_realm: dict[tuple[str, str], DiscordMember] = {}
        discord_by_char: dict[str, list[DiscordMember]] = {}
        for d in discord_members:
            if d.char_name:
                if d.realm_slug:
                    discord_by_char_realm[(d.char_name, d.realm_slug)] = d
                discord_by_char.setdefault(d.char_name, []).append(d)

        # CHECK 3: Discord member with main role but their (char, realm) isn't in any captured guild.
        for d in discord_members:
            if not d.is_main:
                continue
            if not d.char_name:
                findings.append(Finding(
                    category="Discord nick missing character format",
                    character=d.nickname or d.user,
                    realm="(Discord)",
                    detail=f"User {d.user} has main role '{d.main_role}' but nickname doesn't parse as Charname-Realm.",
                    severity="warn",
                ))
                continue
            in_game_match = by_char_realm.get((d.char_name, d.realm_slug))
            if not in_game_match:
                # Fallback: maybe the realm differs (xfer); try char-only match
                if d.char_name in main_index:
                    actual = main_index[d.char_name]
                    findings.append(Finding(
                        category="Realm mismatch (Discord nick vs in-game)",
                        character=d.char_name.title(),
                        realm=d.realm_slug or "?",
                        detail=f"Discord shows {d.realm_slug or '?'} but in-game character is on {actual.get('realmSlug','?')} — update Discord nickname.",
                        severity="action",
                    ))
                else:
                    findings.append(Finding(
                        category=f"Discord {d.main_role} not in any guild",
                        character=d.char_name.title(),
                        realm=d.realm_slug or "?",
                        detail=f"User {d.user} has '{d.main_role}' role but no matching in-game character. Demote to MDGA Friend or remove.",
                        severity="action",
                    ))

        # CHECK 4: In-game main rank but no Discord presence at all.
        for char_lower, entry in main_index.items():
            if char_lower in discord_by_char:
                continue
            findings.append(Finding(
                category="In-game main not in Discord",
                character=entry.get("name", "?"),
                realm=entry.get("realmSlug", "?"),
                detail=f"Rank: {entry.get('rankName','?')} (guild {entry.get('_guild','?')}) — consider inviting to Discord or demoting in-game.",
                severity="action",
            ))

        # CHECK 5: Rank disagreement — Discord says one rank, in-game says another.
        for d in discord_members:
            if not d.is_main or not d.char_name:
                continue
            entry = by_char_realm.get((d.char_name, d.realm_slug)) or main_index.get(d.char_name)
            if not entry:
                continue
            in_game_rank = (entry.get("rankName") or "").strip()
            # Map Discord main role → expected in-game rank
            if d.main_role == "Durotarian" and in_game_rank.upper() != "DUROTARIAN":
                if in_game_rank.upper() in {"ALT", "TRIAL"}:
                    findings.append(Finding(
                        category="Discord = Durotarian but in-game = " + in_game_rank,
                        character=entry.get("name", "?"),
                        realm=entry.get("realmSlug", "?"),
                        detail=f"User {d.user}: promote in-game OR demote Discord role.",
                        severity="action",
                    ))
            elif d.main_role == "Elwynnian" and in_game_rank.upper() != "ELWYNNIAN":
                findings.append(Finding(
                    category="Discord = Elwynnian but in-game = " + in_game_rank,
                    character=entry.get("name", "?"),
                    realm=entry.get("realmSlug", "?"),
                    detail=f"User {d.user}: promote in-game OR demote Discord role.",
                    severity="action",
                ))

        # CHECK 6: Discord roles that mirror in-game ranks (Honorbound, Champion, Durotari…)
        # — flag if the Discord role doesn't match the in-game rank.
        for d in discord_members:
            if not d.char_name:
                continue
            entry = by_char_realm.get((d.char_name, d.realm_slug)) or main_index.get(d.char_name)
            if not entry:
                continue
            in_game_rank = (entry.get("rankName") or "").strip()
            held_game_roles = d.roles & GAME_RANK_ROLES
            if in_game_rank and held_game_roles:
                # Each held game-rank role should match the in-game rank
                for role in held_game_roles:
                    if role.upper() != in_game_rank.upper() and \
                       not (role == "Durotari" and in_game_rank.upper() == "THE DUROTARI"):
                        findings.append(Finding(
                            category="Sub-rank Discord role doesn't match in-game",
                            character=entry.get("name", "?"),
                            realm=entry.get("realmSlug", "?"),
                            detail=f"Discord role '{role}' but in-game rank is '{in_game_rank}'.",
                            severity="warn",
                        ))

    # CHECK 7: Website report counts (if available).
    if website:
        for err in website.get("errors") or []:
            findings.append(Finding(
                category="Website fetch error",
                character="-", realm="-", detail=err, severity="info",
            ))
        for key in ("guild_gaps", "discord_orphans", "spelling_mismatches"):
            n = len(website.get(key) or [])
            if n:
                findings.append(Finding(
                    category=f"Website report: {key.replace('_', ' ')}",
                    character="-", realm="-",
                    detail=f"{n} row(s) — see {key.replace('_', '-')} on the admin dashboard for details.",
                    severity="info",
                ))

    return findings


# ──────────────────────────────────────────────────────────────────
# Report writers
# ──────────────────────────────────────────────────────────────────


def print_console_report(findings: list[Finding]) -> None:
    by_cat: dict[str, list[Finding]] = {}
    for f in findings:
        by_cat.setdefault(f.category, []).append(f)

    print("")
    print("================================================")
    print("  AUDIT REPORT")
    print("================================================")
    if not by_cat:
        print("  No findings — Discord and in-game rosters are in sync.")
        return
    for cat, items in sorted(by_cat.items()):
        sev = items[0].severity.upper()
        print(f"\n  [{sev}] {cat} ({len(items)})")
        for f in items[:25]:
            label = f"{f.character}-{f.realm}" if f.realm not in ("-", "(Discord)", "(left)") else f.character
            print(f"    - {label}: {f.detail}")
        if len(items) > 25:
            print(f"    ... and {len(items) - 25} more (see CSV)")


def write_csv_report(findings: list[Finding], path: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["Category", "Severity", "Character", "Realm", "Detail"])
        writer.writeheader()
        for finding in findings:
            writer.writerow(finding.as_row())


# ──────────────────────────────────────────────────────────────────
# Main flow
# ──────────────────────────────────────────────────────────────────


def prompt(label: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    while True:
        ans = input(f"  {label}{suffix}: ").strip()
        if ans:
            return ans
        if default is not None:
            return default


def prompt_int(label: str, default: int) -> int:
    while True:
        ans = input(f"  {label} [{default}]: ").strip()
        if not ans:
            return default
        try:
            return int(ans)
        except ValueError:
            print("    Please enter a number.")


def prompt_yes_no(label: str, default: bool = True) -> bool:
    suffix = "[Y/n]" if default else "[y/N]"
    ans = input(f"  {label} {suffix}: ").strip().lower()
    if not ans:
        return default
    return ans in ("y", "yes")


def pick_account(wow_path: str) -> str | None:
    accounts = list_account_folders(wow_path)
    if not accounts:
        print(f"  ! No accounts in {os.path.join(wow_path, 'WTF', 'Account')}")
        return prompt("Type the account folder name manually") or None
    if len(accounts) == 1:
        print(f"  Using account: {accounts[0]}")
        return accounts[0]
    print("  Multiple WoW accounts found:")
    for i, a in enumerate(accounts, 1):
        print(f"    {i}) {a}")
    while True:
        ans = input(f"  Pick [1-{len(accounts)}]: ").strip()
        try:
            n = int(ans)
            if 1 <= n <= len(accounts):
                return accounts[n - 1]
        except ValueError:
            pass
        print("    Invalid selection.")


def main() -> int:
    print("")
    print("================================================")
    print(f"  MDGA Audit Tool v{VERSION}")
    print("================================================")
    print("")

    # 1) Locate WoW + account
    wow_path = detect_wow_path()
    if wow_path:
        print(f"  Detected WoW: {wow_path}")
        if not prompt_yes_no("Use this path?", True):
            wow_path = None
    while not wow_path:
        p = prompt("WoW _retail_ folder path").strip('"')
        if os.path.isdir(p):
            wow_path = p
        else:
            print(f"    Path not found: {p}")

    account = pick_account(wow_path)
    if not account:
        print("  ! Cannot continue without account.")
        return 1
    sv_path = os.path.join(wow_path, "WTF", "Account", account, "SavedVariables", "MDGA.lua")
    if not os.path.exists(sv_path):
        print(f"  ! No MDGA.lua at {sv_path}")
        print("  ! Make sure the MDGA addon is installed and you've /reloaded at least once.")
        return 1

    # 2) Capture N guilds
    n_guilds = prompt_int("How many guilds will you capture", 1)
    snapshots: list[GuildSnapshot] = []
    baseline_mtime = os.path.getmtime(sv_path)
    for i in range(1, n_guilds + 1):
        print("")
        print(f"  ── Guild #{i} of {n_guilds} ──")
        print(f"    Log into a character in guild #{i}, click 'Generate Report' in")
        print(f"    the MDGA addon, then click Reload. I'll detect it.")
        snap = watch_for_capture(sv_path, baseline_mtime)
        if not snap:
            print("  ! Timeout waiting for /reload. Aborting.")
            return 1
        print(f"  ✓ Captured: {snap.guild_name} ({len(snap.members)} members)")
        snapshots.append(snap)
        baseline_mtime = os.path.getmtime(sv_path)

    # 3) Discord roster — point the tool at a folder and it picks up every .csv
    #    inside (the bot drops one per main rank: Durotarian + Elwynnian). The
    #    tool de-dupes by Discord user ID.
    discord_members: list[DiscordMember] | None = None
    if prompt_yes_no("Have Discord roster CSV(s) to compare?", True):
        downloads = os.path.join(os.path.expanduser("~"), "Downloads")
        default_dir = downloads if os.path.isdir(downloads) else (
            os.path.dirname(os.path.abspath(sys.argv[0])) if not getattr(sys, "frozen", False)
            else os.path.dirname(sys.executable)
        )
        while True:
            folder = prompt("Folder containing the bot CSVs", default=default_dir).strip('"').strip("'")
            if os.path.isdir(folder):
                csvs = sorted(
                    os.path.join(folder, f) for f in os.listdir(folder)
                    if f.lower().endswith(".csv")
                )
                if not csvs:
                    print(f"    No .csv files in {folder}.")
                    if not prompt_yes_no("Try a different folder?", True):
                        break
                    continue
                print(f"  Found {len(csvs)} CSV file(s):")
                for c in csvs:
                    print(f"    - {os.path.basename(c)}")
                if not prompt_yes_no("Use these?", True):
                    continue
                try:
                    discord_members = read_discord_csvs(csvs)
                    main_count = sum(1 for m in discord_members if m.is_main)
                    print(f"  ✓ Loaded {len(discord_members)} Discord members ({main_count} with main rank).")
                    break
                except Exception as e:
                    print(f"    Couldn't read CSVs: {e}")
                    if not prompt_yes_no("Try a different folder?", True):
                        break
            else:
                print(f"    Folder not found: {folder}")
                if not prompt_yes_no("Try a different folder?", True):
                    break

    # 4) Website pull (optional)
    website: dict[str, Any] | None = None
    if prompt_yes_no("Pull current website roster from mdga.gg?", True):
        server = prompt("Server URL", DEFAULT_SERVER)
        token = prompt("Token (paste from /profile)")
        try:
            website = fetch_website_audit_data(server, token)
            print(f"  ✓ Fetched website reports")
        except Exception as e:
            print(f"  ! Website fetch failed: {e}")
            website = None

    # 5) Audit + reports
    findings = audit(snapshots, discord_members, website)
    print_console_report(findings)

    out_dir = os.path.dirname(os.path.abspath(sys.argv[0])) if not getattr(sys, "frozen", False) else os.path.dirname(sys.executable)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    csv_path = os.path.join(out_dir, f"MDGA_audit_{stamp}.csv")
    write_csv_report(findings, csv_path)
    print(f"\n  Saved full report → {csv_path}")
    print("")
    return 0


if __name__ == "__main__":
    try:
        rc = main()
    except KeyboardInterrupt:
        print("\n  Cancelled.")
        rc = 130
    except Exception as e:
        print(f"\n  ! Fatal: {e}")
        import traceback
        traceback.print_exc()
        rc = 1
    # When run by double-click, hold the window open so the user sees output.
    if sys.stdin and sys.stdin.isatty():
        input("\n  Press Enter to close.")
    sys.exit(rc)
