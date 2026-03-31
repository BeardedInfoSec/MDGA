-- ================================================
-- MDGA MASS WHISPER
-- Send whispers to online guild members with
-- rank/class filters and throttling.
-- ================================================
local addonName, ns = ...

local WHISPER_DELAY = 0.6
local MAX_BATCH = 100

local whisperQueue = {}
local whisperTimer = 0
local isSending = false
local whispersSent = 0
local whispersTotal = 0

function ns:GetOnlineMembers(filters)
    filters = filters or {}
    local members = {}
    if not IsInGuild() then return members end

    local totalMembers = GetNumGuildMembers()
    local playerName = UnitName("player")

    for i = 1, totalMembers do
        local name, rankName, rankIndex, level, classLoc, zone,
              publicNote, officerNote, isOnline, status, classFileName = GetGuildRosterInfo(i)

        if name and isOnline then
            local shortName = name:match("^(.+)-") or name
            if shortName ~= playerName then
                local include = true

                if filters.ranks and #filters.ranks > 0 then
                    local found = false
                    for _, r in ipairs(filters.ranks) do
                        if rankIndex == r then found = true; break end
                    end
                    if not found then include = false end
                end

                if include and filters.classes and #filters.classes > 0 then
                    local found = false
                    for _, c in ipairs(filters.classes) do
                        if classFileName == c then found = true; break end
                    end
                    if not found then include = false end
                end

                if include and filters.minLevel and level < filters.minLevel then
                    include = false
                end

                if include then
                    table.insert(members, {
                        name          = name,
                        shortName     = shortName,
                        rankIndex     = rankIndex,
                        rankName      = rankName,
                        classFileName = classFileName,
                        level         = level,
                        zone          = zone,
                    })
                end
            end
        end
    end
    return members
end

function ns:StartMassWhisper(message, filters)
    if isSending then
        print("|cffB91C1C[MDGA]|r A mass whisper is already in progress. Use /mdga whisper stop to cancel.")
        return
    end
    if not message or message == "" then
        print("|cffB91C1C[MDGA]|r No message specified.")
        return
    end

    local targets = ns:GetOnlineMembers(filters)
    if #targets == 0 then
        print("|cffF5C518[MDGA]|r No online members match your filters.")
        return
    end
    if #targets > MAX_BATCH then
        print("|cffF5C518[MDGA]|r Capping to " .. MAX_BATCH .. " whispers (out of " .. #targets .. " matches).")
        while #targets > MAX_BATCH do table.remove(targets) end
    end

    whisperQueue = {}
    for _, t in ipairs(targets) do
        table.insert(whisperQueue, { name = t.name, shortName = t.shortName })
    end

    whispersSent = 0
    whispersTotal = #whisperQueue
    isSending = true
    whisperTimer = 0

    print("|cff34D399[MDGA]|r Mass whisper started: " .. whispersTotal .. " recipients.")
    print("|cff888888[MDGA]|r Message: \"" .. message .. "\"")

    local ticker = CreateFrame("Frame", "MDGAWhisperTicker")
    ticker.message = message
    ticker:SetScript("OnUpdate", function(self, elapsed)
        if not isSending then
            self:SetScript("OnUpdate", nil)
            return
        end
        whisperTimer = whisperTimer + elapsed
        if whisperTimer < WHISPER_DELAY then return end
        whisperTimer = 0

        if #whisperQueue == 0 then
            isSending = false
            self:SetScript("OnUpdate", nil)
            print("|cff34D399[MDGA]|r Mass whisper complete! Sent to " .. whispersSent .. " players.")
            if ns.RefreshWhisperGUI then ns:RefreshWhisperGUI() end
            return
        end

        local target = table.remove(whisperQueue, 1)
        SendChatMessage(self.message, "WHISPER", nil, target.name)
        whispersSent = whispersSent + 1

        if whispersSent % 10 == 0 then
            print("|cff888888[MDGA]|r Whisper progress: " .. whispersSent .. "/" .. whispersTotal)
        end
        if ns.RefreshWhisperGUI then ns:RefreshWhisperGUI() end
    end)
end

function ns:StopMassWhisper()
    if isSending then
        isSending = false
        whisperQueue = {}
        print("|cffF5C518[MDGA]|r Mass whisper cancelled. Sent " .. whispersSent .. "/" .. whispersTotal .. ".")
    else
        print("|cff888888[MDGA]|r No mass whisper in progress.")
    end
end

function ns:GetWhisperStatus()
    return {
        isSending = isSending,
        sent = whispersSent,
        total = whispersTotal,
        remaining = #whisperQueue,
    }
end

function ns:HandleWhisperCommand(args)
    if args == "stop" then
        ns:StopMassWhisper()
        return
    end
    if args == "status" then
        local s = ns:GetWhisperStatus()
        if s.isSending then
            print("|cffF5C518[MDGA]|r Whisper in progress: " .. s.sent .. "/" .. s.total .. " (" .. s.remaining .. " remaining)")
        else
            print("|cff888888[MDGA]|r No mass whisper in progress.")
        end
        return
    end
    if not args or args == "" then
        ns:ShowWhisperGUI()
        return
    end
    ns:StartMassWhisper(args, {})
end
