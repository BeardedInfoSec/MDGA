-- ================================================
-- MDGA GUILD ACTIONS
-- Promote, demote, and kick guild members with
-- confirmation dialogs. Requires officer permissions.
-- ================================================
local addonName, ns = ...

-- ── Promote ──
function ns:PromoteMember(fullName)
    GuildPromote(fullName)
    print("|cff34D399[MDGA]|r Promoted " .. fullName)
    C_Timer.After(1.5, function()
        C_GuildInfo.GuildRoster()
    end)
end

-- ── Demote ──
function ns:DemoteMember(fullName)
    GuildDemote(fullName)
    print("|cffF5C518[MDGA]|r Demoted " .. fullName)
    C_Timer.After(1.5, function()
        C_GuildInfo.GuildRoster()
    end)
end

-- ── Kick ──
function ns:KickMember(fullName)
    GuildUninvite(fullName)
    print("|cffB91C1C[MDGA]|r Kicked " .. fullName)
    C_Timer.After(1.5, function()
        C_GuildInfo.GuildRoster()
    end)
end

-- ── Confirmation dialogs ──
StaticPopupDialogs["MDGA_CONFIRM_PROMOTE"] = {
    text = "Promote |cff34D399%s|r by one rank?",
    button1 = "Promote",
    button2 = "Cancel",
    OnAccept = function(self, data)
        ns:PromoteMember(data)
    end,
    timeout = 0,
    whileDead = true,
    hideOnEscape = true,
    preferredIndex = 3,
}

StaticPopupDialogs["MDGA_CONFIRM_DEMOTE"] = {
    text = "Demote |cffF5C518%s|r by one rank?",
    button1 = "Demote",
    button2 = "Cancel",
    OnAccept = function(self, data)
        ns:DemoteMember(data)
    end,
    timeout = 0,
    whileDead = true,
    hideOnEscape = true,
    preferredIndex = 3,
}

StaticPopupDialogs["MDGA_CONFIRM_KICK"] = {
    text = "Kick |cffB91C1C%s|r from the guild?\n\n|cffFF4444This cannot be undone!|r",
    button1 = "Kick",
    button2 = "Cancel",
    OnAccept = function(self, data)
        ns:KickMember(data)
    end,
    timeout = 0,
    whileDead = true,
    hideOnEscape = true,
    preferredIndex = 3,
}

-- Helper to show a confirmation dialog with member data
function ns:ConfirmPromote(fullName, displayName)
    local dialog = StaticPopup_Show("MDGA_CONFIRM_PROMOTE", displayName or fullName)
    if dialog then dialog.data = fullName end
end

function ns:ConfirmDemote(fullName, displayName)
    local dialog = StaticPopup_Show("MDGA_CONFIRM_DEMOTE", displayName or fullName)
    if dialog then dialog.data = fullName end
end

function ns:ConfirmKick(fullName, displayName)
    local dialog = StaticPopup_Show("MDGA_CONFIRM_KICK", displayName or fullName)
    if dialog then dialog.data = fullName end
end
