-- ================================================
-- MDGA TOOLKIT QUEUE consumer
-- Reads MDGA_Toolkit_Queue (written by the desktop toolkit's
-- SavedVariables I/O) and applies each entry in-game. Writes
-- per-row outcomes to MDGA_Toolkit_Results for the toolkit to read
-- back on its next "Sync results" pull.
--
-- Officer gate: respects ns.enabled (set by Core.lua's officer check).
-- Safety: a one-shot StaticPopup confirms before running. Kicks are
-- irreversible, so the popup shows a breakdown by action type so the
-- officer can see exactly what's about to fire.
-- ================================================
local _, ns = ...

local function PrintGood(msg) print("|cff34D399[MDGA]|r " .. msg) end
local function PrintWarn(msg) print("|cffF5C518[MDGA]|r " .. msg) end

-- ── Roster index ──
-- WoW gives us roster info by 1-based index. Building a name → index
-- map lets the toolkit reference members by their human-readable
-- "Name-Realm" string. Tries case-insensitive full match first, then
-- name-only fallback for entries the toolkit couldn't disambiguate.
local function BuildRosterIndex()
    local map = {}
    local total = GetNumGuildMembers() or 0
    for i = 1, total do
        local fullName = GetGuildRosterInfo(i)
        if fullName then
            map[fullName:lower()] = i
            local nameOnly = fullName:match("^([^-]+)")
            if nameOnly then
                -- Only store name-only mapping if it's unambiguous;
                -- otherwise drop it so an exact match is required.
                local key = nameOnly:lower()
                if map[key] == nil then
                    map[key] = i
                else
                    map[key] = false -- collision marker
                end
            end
        end
    end
    return map
end

local function ResolveRosterIndex(rosterIndex, target)
    if not target or target == "" then return nil end
    local idx = rosterIndex[target:lower()]
    if idx then return idx end
    local nameOnly = target:match("^([^-]+)")
    if nameOnly then
        idx = rosterIndex[nameOnly:lower()]
        if idx then return idx end
    end
    return nil
end

-- ── Action dispatchers ──
-- Returns (status, message) where status is "ok" | "applied_already" | "failed".
local function ApplyEntry(entry, rosterIndex)
    local action = entry.action
    local target = entry.target
    local args = entry.args or {}

    if action == "kick_from_guild" then
        local idx = ResolveRosterIndex(rosterIndex, target)
        if not idx then return "failed", "not in roster" end
        GuildUninvite(target)
        return "ok", nil

    elseif action == "set_officer_note" then
        local idx = ResolveRosterIndex(rosterIndex, target)
        if not idx then return "failed", "not in roster" end
        local note = args.note or ""
        -- GetGuildRosterInfo returns officerNote at position 8
        local existing = select(8, GetGuildRosterInfo(idx))
        if existing == note then return "applied_already", "note already correct" end
        if not CanEditOfficerNote or not CanEditOfficerNote() then
            return "failed", "no permission to edit officer notes"
        end
        GuildRosterSetOfficerNote(idx, note)
        return "ok", nil

    else
        return "failed", "unknown action: " .. tostring(action)
    end
end

-- ── Drain ──
-- Idempotent: clears MDGA_Toolkit_Queue once consumed; appends to
-- MDGA_Toolkit_Results. Bounded to 200 most recent results so the SV
-- file doesn't grow forever.
local function DrainQueue()
    MDGA_Toolkit_Queue   = MDGA_Toolkit_Queue   or {}
    MDGA_Toolkit_Results = MDGA_Toolkit_Results or {}

    local pending = #MDGA_Toolkit_Queue
    if pending == 0 then return end

    local rosterIndex = BuildRosterIndex()
    local ok, already, failed = 0, 0, 0

    for _, entry in ipairs(MDGA_Toolkit_Queue) do
        local status, message = ApplyEntry(entry, rosterIndex)
        -- target + action included so the toolkit can match results
        -- back to specific reconciliation rows without keeping its own
        -- "queue id → row" map across restarts.
        table.insert(MDGA_Toolkit_Results, {
            id         = entry.id or "",
            target     = entry.target or "",
            action     = entry.action or "",
            status     = status,
            message    = message or "",
            applied_at = time(),
        })
        if status == "ok" then ok = ok + 1
        elseif status == "applied_already" then already = already + 1
        else failed = failed + 1 end
    end

    while #MDGA_Toolkit_Results > 200 do
        table.remove(MDGA_Toolkit_Results, 1)
    end

    MDGA_Toolkit_Queue = {}

    PrintGood(string.format("Toolkit: %d applied, %d already done, %d failed (of %d queued)",
        ok, already, failed, pending))
    C_Timer.After(1.5, function() C_GuildInfo.GuildRoster() end)
end

-- ── Confirm popup ──
-- One-shot per login session. Shows a breakdown so the officer can
-- abort if the queue looks wrong before any in-game write happens.
StaticPopupDialogs["MDGA_TOOLKIT_CONFIRM"] = {
    text = "%s",
    button1 = "Apply",
    button2 = "Skip",
    OnAccept = function() DrainQueue() end,
    OnCancel = function() PrintWarn("Toolkit: queue skipped this session. It will be offered again next login.") end,
    timeout = 0,
    whileDead = true,
    hideOnEscape = true,
    preferredIndex = 3,
}

local function PromptThenDrain()
    MDGA_Toolkit_Queue = MDGA_Toolkit_Queue or {}
    local pending = #MDGA_Toolkit_Queue
    if pending == 0 then return end

    local byAction = {}
    for _, entry in ipairs(MDGA_Toolkit_Queue) do
        local k = entry.action or "unknown"
        byAction[k] = (byAction[k] or 0) + 1
    end
    local lines = {}
    for k, n in pairs(byAction) do
        table.insert(lines, string.format("  %s x %d", k, n))
    end
    table.sort(lines)
    local msg = string.format("MDGA Toolkit has %d queued action%s:\n%s\nApply now?",
        pending, pending == 1 and "" or "s", table.concat(lines, "\n"))
    StaticPopup_Show("MDGA_TOOLKIT_CONFIRM", msg)
end

-- ── Event wiring ──
-- PLAYER_ENTERING_WORLD triggers the roster fetch; the first
-- GUILD_ROSTER_UPDATE after that is our cue to prompt + drain.
local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:RegisterEvent("GUILD_ROSTER_UPDATE")

local promptedThisSession = false

frame:SetScript("OnEvent", function(self, event)
    if not ns.enabled then return end
    if event == "PLAYER_ENTERING_WORLD" then
        promptedThisSession = false
        C_Timer.After(2.0, function() C_GuildInfo.GuildRoster() end)
    elseif event == "GUILD_ROSTER_UPDATE" then
        if promptedThisSession then return end
        promptedThisSession = true
        C_Timer.After(1.0, PromptThenDrain)
    end
end)

-- ── Slash command ──
-- /mdga-toolkit lets officers re-trigger the prompt without relogging
-- (useful if they queue more actions mid-session).
SLASH_MDGATOOLKIT1 = "/mdga-toolkit"
SlashCmdList["MDGATOOLKIT"] = function()
    if not ns.enabled then
        PrintWarn("Toolkit consumer requires officer rank.")
        return
    end
    PromptThenDrain()
end
