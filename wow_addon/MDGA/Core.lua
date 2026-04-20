-- ================================================
-- MDGA GUILD TRACKER — Core.lua
-- Initialization, SavedVariables schema, slash commands,
-- player/guild info, and OFFICER GATE.
-- ================================================
local addonName, ns = ...

ns.VERSION = "1.4.0"
ns.SCHEMA_VERSION = 3
ns.OFFICER_RANK_THRESHOLD = 2 -- 0=GM, 1=Officer, 2=Senior Officer

-- State flags
ns.enabled = false  -- set to true ONLY if officer check passes
ns.initialized = false

-- Class colours (WoW standard)
ns.CLASS_COLORS = {
    WARRIOR     = { r = 0.78, g = 0.61, b = 0.43 },
    PALADIN     = { r = 0.96, g = 0.55, b = 0.73 },
    HUNTER      = { r = 0.67, g = 0.83, b = 0.45 },
    ROGUE       = { r = 1.00, g = 0.96, b = 0.41 },
    PRIEST      = { r = 1.00, g = 1.00, b = 1.00 },
    DEATHKNIGHT = { r = 0.77, g = 0.12, b = 0.23 },
    SHAMAN      = { r = 0.00, g = 0.44, b = 0.87 },
    MAGE        = { r = 0.25, g = 0.78, b = 0.92 },
    WARLOCK     = { r = 0.53, g = 0.53, b = 0.93 },
    MONK        = { r = 0.00, g = 1.00, b = 0.60 },
    DRUID       = { r = 1.00, g = 0.49, b = 0.04 },
    DEMONHUNTER = { r = 0.64, g = 0.19, b = 0.79 },
    EVOKER      = { r = 0.20, g = 0.58, b = 0.50 },
}

-- ── Event Frame ──
local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:RegisterEvent("PLAYER_LOGOUT")

-- ── Print helpers ──
local function Print(msg)
    print("|cffB91C1C[MDGA]|r " .. msg)
end

local function PrintGood(msg)
    print("|cff34D399[MDGA]|r " .. msg)
end

local function PrintWarn(msg)
    print("|cffF5C518[MDGA]|r " .. msg)
end

-- ── Initialize SavedVariables ──
local function InitSavedVars()
    if not MDGA_Data or (MDGA_Data.version or 0) < ns.SCHEMA_VERSION then
        MDGA_Data = {
            version      = ns.SCHEMA_VERSION,
            addonVersion = ns.VERSION,
            capturedBy   = "",
            capturedAt   = 0,
            lastScanAt   = 0,
            guildInfo    = {},
            playerInfo   = {},
            roster       = {},
            events       = {},
        }
    end
    MDGA_Data.version = ns.SCHEMA_VERSION
    MDGA_Data.addonVersion = ns.VERSION
    MDGA_Data.guildInfo = MDGA_Data.guildInfo or {}
    MDGA_Data.playerInfo = MDGA_Data.playerInfo or {}
    MDGA_Data.roster = MDGA_Data.roster or {}
    MDGA_Data.events = MDGA_Data.events or {}
    MDGA_Data.minimapPos = MDGA_Data.minimapPos or 225
    MDGA_Data.calendarEvents = MDGA_Data.calendarEvents or {}
    MDGA_Data.websiteEvents = MDGA_Data.websiteEvents or {}
    MDGA_Data.bankLog = MDGA_Data.bankLog or {}
    MDGA_Data.attendance = MDGA_Data.attendance or {}
    MDGA_Data.attendanceConfig = MDGA_Data.attendanceConfig or {
        enabled   = false,
        raidDays  = {},   -- { [1]=true, [3]=true } — 1=Sun..7=Sat
        startHour = 19,
        endHour   = 23,
    }
    MDGA_Data.autoMessages = MDGA_Data.autoMessages or {
        enabled    = false,
        welcomeMsg = "Welcome to the guild, %name%!",
        goodbyeMsg = "%name% has left us. /salute",
    }
end

-- ── Realm slug helper ──
function ns:RealmSlug(realmName)
    if not realmName or realmName == "" then return "" end
    local slug = realmName:lower()
    slug = slug:gsub("[' ]", "-")
    slug = slug:gsub("[^a-z0-9%-]", "")
    return slug
end

-- ── Unique event ID generator ──
local eventCounter = 0
function ns:NewEventId()
    eventCounter = eventCounter + 1
    return "evt_" .. time() .. "_" .. eventCounter
end

-- ── Append event (with 500-entry trim) ──
function ns:AddEvent(eventType, charName, realmSlug, data)
    if not ns.enabled then return end

    local evt = {
        id            = self:NewEventId(),
        type          = eventType,
        characterName = charName,
        realmSlug     = realmSlug,
        timestamp     = time(),
        data          = data or {},
    }
    table.insert(MDGA_Data.events, evt)

    while #MDGA_Data.events > 500 do
        table.remove(MDGA_Data.events, 1)
    end
end

-- ── Update player info ──
function ns:UpdatePlayerInfo()
    local name = UnitName("player")
    local realmName = GetRealmName()
    local _, classFile = UnitClass("player")
    local specIndex = GetSpecialization and GetSpecialization() or nil
    local specName = nil
    if specIndex and GetSpecializationInfo then
        _, specName = GetSpecializationInfo(specIndex)
    end
    local avgIlvl = 0
    if GetAverageItemLevel then
        _, avgIlvl = GetAverageItemLevel()
    end

    local rankIndex = nil
    local rankName = nil
    if IsInGuild() then
        local _, gRankName, gRankIndex = GetGuildInfo("player")
        rankIndex = gRankIndex
        rankName = gRankName
    end

    -- Professions
    local profs = {}
    if GetProfessions then
        local prof1, prof2, arch, fish, cook = GetProfessions()
        local profIndices = { prof1, prof2, arch, fish, cook }
        for _, idx in ipairs(profIndices) do
            if idx and GetProfessionInfo then
                local pName, pIcon, pRank, pMaxRank = GetProfessionInfo(idx)
                if pName then
                    table.insert(profs, {
                        name     = pName,
                        icon     = pIcon,
                        level    = pRank or 0,
                        maxLevel = pMaxRank or 0,
                    })
                end
            end
        end
    end

    MDGA_Data.playerInfo = {
        name        = name,
        realm       = realmName,
        realmSlug   = self:RealmSlug(realmName),
        class       = classFile,
        spec        = specName,
        level       = UnitLevel("player"),
        itemLevel   = math.floor(avgIlvl or 0),
        rankIndex   = rankIndex,
        rankName    = rankName,
        professions = profs,
    }
end

-- ── Update guild info ──
function ns:UpdateGuildInfo()
    if not IsInGuild() then
        MDGA_Data.guildInfo = {}
        return
    end

    local guildName = GetGuildInfo("player")
    MDGA_Data.guildInfo.name = guildName
    MDGA_Data.guildInfo.faction = UnitFactionGroup("player")

    MDGA_Data.guildInfo.rankNames = {}
    local numRanks = 0
    if GuildControlGetNumRanks then
        numRanks = GuildControlGetNumRanks()
    end
    MDGA_Data.guildInfo.numRanks = numRanks
    for i = 1, numRanks do
        local rankName = GuildControlGetRankName and GuildControlGetRankName(i) or ("Rank " .. (i - 1))
        MDGA_Data.guildInfo.rankNames[i - 1] = rankName
    end
end

-- ── Note helpers ──
function ns:FindRosterIndex(fullName)
    local totalMembers = GetNumGuildMembers()
    for i = 1, totalMembers do
        local name = GetGuildRosterInfo(i)
        if name == fullName then
            return i
        end
    end
    return nil
end

function ns:GetMemberNotes(fullName)
    local idx = ns:FindRosterIndex(fullName)
    if not idx then return nil, nil end
    local _, _, _, _, _, _, publicNote, officerNote = GetGuildRosterInfo(idx)
    return publicNote or "", officerNote or ""
end

function ns:SetPublicNote(fullName, note)
    local idx = ns:FindRosterIndex(fullName)
    if idx then
        GuildRosterSetPublicNote(idx, note or "")
        print("|cff34D399[MDGA]|r Public note updated for " .. fullName)
    end
end

function ns:SetOfficerNote(fullName, note)
    local idx = ns:FindRosterIndex(fullName)
    if idx then
        GuildRosterSetOfficerNote(idx, note or "")
        print("|cff34D399[MDGA]|r Officer note updated for " .. fullName)
    end
end

-- ── Attendance recording (called from GuildTracker after roster scan) ──
function ns:RecordAttendance(onlineRoster)
    local config = MDGA_Data.attendanceConfig or {}
    if not config.enabled then return end

    local hour = tonumber(date("%H"))
    local dayOfWeek = tonumber(date("%w")) + 1 -- 1=Sunday..7=Saturday

    if not config.raidDays or not config.raidDays[dayOfWeek] then return end
    if hour < (config.startHour or 19) or hour >= (config.endHour or 23) then return end

    local dateKey = date("%Y-%m-%d")
    MDGA_Data.attendance[dateKey] = MDGA_Data.attendance[dateKey] or {}

    for key, m in pairs(onlineRoster) do
        if m.isOnline then
            MDGA_Data.attendance[dateKey][key] = true
        end
    end

    -- Trim attendance data older than 90 days
    local cutoff = time() - (90 * 86400)
    for dk, _ in pairs(MDGA_Data.attendance) do
        local y, mo, d = dk:match("^(%d+)-(%d+)-(%d+)$")
        if y then
            local t = time({ year = tonumber(y), month = tonumber(mo), day = tonumber(d) })
            if t < cutoff then
                MDGA_Data.attendance[dk] = nil
            end
        end
    end
end

-- ── MOTD helpers ──
function ns:GetMOTD()
    if IsInGuild() then
        return GetGuildRosterMOTD() or ""
    end
    return ""
end

function ns:SetMOTD(text)
    if IsInGuild() then
        GuildSetMOTD(text or "")
        print("|cff34D399[MDGA]|r Guild MOTD updated.")
    end
end

-- ── OFFICER GATE ──
-- TODO: RE-ENABLE OFFICER CHECK AFTER TESTING
local function CheckOfficerStatus()
    if not IsInGuild() then
        PrintWarn("Not in a guild. Addon disabled.")
        ns.enabled = false
        return
    end

    local _, _, rankIndex = GetGuildInfo("player")
    if rankIndex == nil then
        PrintWarn("Guild data loading... will recheck officer status.")
        ns.enabled = false
        return
    end

    if rankIndex > ns.OFFICER_RANK_THRESHOLD then
        PrintWarn("Your guild rank (" .. rankIndex .. ") is below officer threshold. Addon DISABLED.")
        PrintWarn("Only officers (rank 0-" .. ns.OFFICER_RANK_THRESHOLD .. ") may use this addon.")
        ns.enabled = false
        MDGA_Data.events = {}
        MDGA_Data.roster = {}
        return
    end

    ns.enabled = true
    PrintGood("Rank " .. rankIndex .. " — officer verified. Addon ACTIVE.")
end

-- ── Event handler ──
frame:SetScript("OnEvent", function(self, event, ...)
    if event == "ADDON_LOADED" then
        local loaded = ...
        if loaded ~= addonName then return end

        InitSavedVars()
        ns:InitMinimapButton()
        ns.initialized = true
        Print("v" .. ns.VERSION .. " loaded. Checking officer status...")

    elseif event == "PLAYER_ENTERING_WORLD" then
        if not ns.initialized then return end

        ns:UpdatePlayerInfo()
        ns:UpdateGuildInfo()
        CheckOfficerStatus()

        if ns.enabled and IsInGuild() then
            C_GuildInfo.GuildRoster()
        end

    elseif event == "PLAYER_LOGOUT" then
        if not ns.initialized then return end
        MDGA_Data.capturedAt = time()
        MDGA_Data.capturedBy = (UnitName("player") or "Unknown") .. "-" .. ns:RealmSlug(GetRealmName())
        if not ns.enabled then
            MDGA_Data.events = {}
            MDGA_Data.roster = {}
        end
    end
end)

ns.CheckOfficerStatus = CheckOfficerStatus

-- ── Slash commands ──
SLASH_MDGA1 = "/mdga"
SlashCmdList["MDGA"] = function(msg)
    if not ns.initialized then
        Print("Addon not initialized yet.")
        return
    end

    local cmd, rest = (msg or ""):lower():trim():match("^(%S*)%s*(.*)")
    cmd = cmd or ""
    rest = rest or ""

    if cmd == "" or cmd == "show" then
        ns:ToggleGUI()

    elseif cmd == "status" then
        local rosterCount = 0
        for _ in pairs(MDGA_Data.roster) do rosterCount = rosterCount + 1 end
        local eventCount = #MDGA_Data.events

        Print("Status:")
        if ns.enabled then
            PrintGood("  Active: YES")
        else
            PrintWarn("  Active: NO (insufficient rank or not in guild)")
        end
        Print("  Roster: " .. rosterCount .. " members tracked")
        Print("  Events: " .. eventCount .. " pending")
        if MDGA_Data.lastScanAt > 0 then
            Print("  Last scan: " .. date("%Y-%m-%d %H:%M:%S", MDGA_Data.lastScanAt))
        else
            Print("  Last scan: never")
        end
        Print("  Player: " .. (MDGA_Data.playerInfo.name or "?") .. " (rank " .. tostring(MDGA_Data.playerInfo.rankIndex or "?") .. ")")

    elseif cmd == "scan" then
        if not ns.enabled then
            PrintWarn("Addon is disabled.")
            return
        end
        if not IsInGuild() then
            PrintWarn("You are not in a guild.")
            return
        end
        C_GuildInfo.GuildRoster()
        PrintGood("Roster scan requested. Data will update shortly.")

    elseif cmd == "whisper" then
        ns:HandleWhisperCommand(rest)

    elseif cmd == "reset" then
        MDGA_Data.events = {}
        MDGA_Data.roster = {}
        MDGA_Data.lastScanAt = 0
        PrintGood("Saved data reset.")
        if ns.RefreshGUI then ns:RefreshGUI() end

    else
        Print("Commands:")
        Print("  /mdga             — Toggle status panel")
        Print("  /mdga status      — Show status in chat")
        Print("  /mdga scan        — Scan guild roster")
        Print("  /mdga whisper     — Open mass whisper")
        Print("  /mdga whisper <msg> — Whisper all online")
        Print("  /mdga whisper stop — Cancel mass whisper")
        Print("  /mdga reset       — Clear all saved data")
    end
end
