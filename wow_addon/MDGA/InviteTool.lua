-- ================================================
-- MDGA INVITE TOOL
-- Batch-invite players to the guild with throttling.
-- ================================================
local addonName, ns = ...

local INVITE_DELAY = 1.0
local inviteQueue = {}
local isInviting = false
local invitesSent = 0
local invitesTotal = 0

function ns:StartBatchInvite(names)
    if isInviting then
        print("|cffB91C1C[MDGA]|r An invite batch is already in progress. Use /mdga invite stop.")
        return
    end
    if not names or #names == 0 then
        print("|cffB91C1C[MDGA]|r No names to invite.")
        return
    end

    inviteQueue = {}
    for _, name in ipairs(names) do
        local trimmed = name:trim()
        if trimmed ~= "" then
            table.insert(inviteQueue, trimmed)
        end
    end

    if #inviteQueue == 0 then return end

    invitesSent = 0
    invitesTotal = #inviteQueue
    isInviting = true

    print("|cff34D399[MDGA]|r Batch invite started: " .. invitesTotal .. " invites.")

    local ticker = CreateFrame("Frame", "MDGAInviteTicker")
    local timer = 0
    ticker:SetScript("OnUpdate", function(self, elapsed)
        if not isInviting then
            self:SetScript("OnUpdate", nil)
            return
        end
        timer = timer + elapsed
        if timer < INVITE_DELAY then return end
        timer = 0

        if #inviteQueue == 0 then
            isInviting = false
            self:SetScript("OnUpdate", nil)
            print("|cff34D399[MDGA]|r Batch invite complete! Sent " .. invitesSent .. " invites.")
            if ns.RefreshGUI then ns:RefreshGUI() end
            return
        end

        local name = table.remove(inviteQueue, 1)
        GuildInvite(name)
        invitesSent = invitesSent + 1

        if invitesSent % 5 == 0 then
            print("|cff888888[MDGA]|r Invite progress: " .. invitesSent .. "/" .. invitesTotal)
        end
        if ns.RefreshGUI then ns:RefreshGUI() end
    end)
end

function ns:StopBatchInvite()
    if isInviting then
        isInviting = false
        inviteQueue = {}
        print("|cffF5C518[MDGA]|r Batch invite cancelled. Sent " .. invitesSent .. "/" .. invitesTotal .. ".")
    else
        print("|cff888888[MDGA]|r No batch invite in progress.")
    end
end

function ns:GetInviteStatus()
    return {
        isInviting = isInviting,
        sent = invitesSent,
        total = invitesTotal,
        remaining = #inviteQueue,
    }
end
