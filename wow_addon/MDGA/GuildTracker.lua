-- ================================================
-- MDGA GUILD TRACKER — GuildTracker.lua
-- Listens for guild events, scans roster, detects
-- rank changes, joins, leaves, online/offline.
-- ================================================
local addonName, ns = ...

local frame = CreateFrame("Frame")
frame:RegisterEvent("GUILD_ROSTER_UPDATE")
frame:RegisterEvent("CHAT_MSG_SYSTEM")

local lastScanTime = 0
local SCAN_COOLDOWN = 5

local PATTERN_JOIN    = "(.+) has joined the guild%."
local PATTERN_LEAVE   = "(.+) has left the guild%."
local PATTERN_PROMOTE = "(.+) has promoted (.+) to (.+)%."
local PATTERN_DEMOTE  = "(.+) has demoted (.+) to (.+)%."
local PATTERN_REMOVE  = "(.+) has been kicked out of the guild by (.+)%."

local function SplitNameRealm(fullName)
    local name, realm = fullName:match("^(.+)-(.+)$")
    if not name then
        name = fullName
        realm = MDGA_Data.playerInfo.realmSlug or ""
    else
        realm = ns:RealmSlug(realm)
    end
    return name, realm
end

local function ScanRoster()
    if not ns.enabled then return end
    if not IsInGuild() then return end

    local totalMembers = GetNumGuildMembers()
    if totalMembers == 0 then return end

    ns:UpdatePlayerInfo()
    -- TODO: RE-ENABLE OFFICER CHECK AFTER TESTING
    -- if MDGA_Data.playerInfo.rankIndex and MDGA_Data.playerInfo.rankIndex > ns.OFFICER_RANK_THRESHOLD then
    --     ns.CheckOfficerStatus()
    --     return
    -- end

    local playerRealmSlug = MDGA_Data.playerInfo.realmSlug or ""
    local newRoster = {}
    local hadPreviousRoster = (MDGA_Data.lastScanAt > 0) and (next(MDGA_Data.roster) ~= nil)

    for i = 1, totalMembers do
        local name, rankName, rankIndex, level, classLoc, zone,
              publicNote, officerNote, isOnline, status, classFileName,
              achievementPoints, achievementRank, isMobile, canSoR,
              repStanding, guid = GetGuildRosterInfo(i)

        if name then
            local charName, charRealm = name:match("^(.+)-(.+)$")
            if not charName then
                charName = name
                charRealm = playerRealmSlug
            else
                charRealm = ns:RealmSlug(charRealm)
            end

            local key = charName .. "-" .. charRealm

            newRoster[key] = {
                name      = charName,
                realmSlug = charRealm,
                class     = classFileName,
                level     = level,
                rankIndex = rankIndex,
                rankName  = rankName,
                isOnline  = isOnline or false,
                zone      = zone or "",
                lastSeen  = time(),
            }

            local old = MDGA_Data.roster[key]
            if old and old.rankIndex ~= nil and old.rankIndex ~= rankIndex then
                ns:AddEvent("rank_change", charName, charRealm, {
                    oldRank     = old.rankIndex,
                    oldRankName = old.rankName,
                    newRank     = rankIndex,
                    newRankName = rankName,
                })
            end

            -- Online/offline transitions tracked in roster state only (not as events)
            -- to avoid flooding the event log with noise
        end
    end

    if hadPreviousRoster then
        for key, old in pairs(MDGA_Data.roster) do
            if not newRoster[key] then
                ns:AddEvent("leave", old.name, old.realmSlug, {
                    previousRank     = old.rankIndex,
                    previousRankName = old.rankName,
                    detectedBy       = "roster_diff",
                })
            end
        end

        for key, new in pairs(newRoster) do
            if not MDGA_Data.roster[key] then
                ns:AddEvent("join", new.name, new.realmSlug, {
                    rank       = new.rankIndex,
                    rankName   = new.rankName,
                    detectedBy = "roster_diff",
                })
            end
        end
    end

    MDGA_Data.roster = newRoster
    MDGA_Data.lastScanAt = time()

    ns:UpdateGuildInfo()

    -- Record attendance if during configured raid hours
    if ns.RecordAttendance then ns:RecordAttendance(newRoster) end

    if ns.RefreshGUI then ns:RefreshGUI() end
end

local function ParseSystemMessage(msg)
    if not ns.enabled then return end
    if not msg then return end

    local joiner = msg:match(PATTERN_JOIN)
    if joiner then
        local name, realm = SplitNameRealm(joiner)
        ns:AddEvent("join", name, realm, { source = "system_message" })
        if ns.SendAutoMessage then ns:SendAutoMessage("welcome", name) end
        return
    end

    local leaver = msg:match(PATTERN_LEAVE)
    if leaver then
        local name, realm = SplitNameRealm(leaver)
        ns:AddEvent("leave", name, realm, { source = "system_message" })
        if ns.SendAutoMessage then ns:SendAutoMessage("goodbye", name) end
        return
    end

    local promoter, promotee, newRank = msg:match(PATTERN_PROMOTE)
    if promoter and promotee then
        local name, realm = SplitNameRealm(promotee)
        ns:AddEvent("rank_change", name, realm, {
            newRankName = newRank,
            promotedBy  = promoter,
            source      = "system_message",
        })
        return
    end

    local demoter, demotee, newRank2 = msg:match(PATTERN_DEMOTE)
    if demoter and demotee then
        local name, realm = SplitNameRealm(demotee)
        ns:AddEvent("rank_change", name, realm, {
            newRankName = newRank2,
            demotedBy   = demoter,
            source      = "system_message",
        })
        return
    end

    local kicked, kicker = msg:match(PATTERN_REMOVE)
    if kicked and kicker then
        local name, realm = SplitNameRealm(kicked)
        ns:AddEvent("leave", name, realm, {
            kickedBy = kicker,
            source   = "system_message",
        })
        if ns.SendAutoMessage then ns:SendAutoMessage("goodbye", name) end
        return
    end
end

frame:SetScript("OnEvent", function(self, event, ...)
    if event == "GUILD_ROSTER_UPDATE" then
        local now = GetTime()
        if (now - lastScanTime) < SCAN_COOLDOWN then return end
        lastScanTime = now

        if not ns.enabled and ns.initialized then
            ns.CheckOfficerStatus()
        end

        ScanRoster()

    elseif event == "CHAT_MSG_SYSTEM" then
        local msg = ...
        ParseSystemMessage(msg)
    end
end)
