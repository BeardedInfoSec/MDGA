-- ================================================
-- MDGA AUTO MESSAGES
-- Sends welcome/goodbye messages in guild chat
-- when members join or leave. Configurable templates.
-- Called from GuildTracker on join/leave events.
-- ================================================
local addonName, ns = ...

local THROTTLE = 5  -- minimum seconds between auto-messages
local lastMessageTime = 0

function ns:SendAutoMessage(msgType, playerName)
    MDGA_Data.autoMessages = MDGA_Data.autoMessages or {}
    if not MDGA_Data.autoMessages.enabled then return end
    if not IsInGuild() then return end

    local now = GetTime()
    if (now - lastMessageTime) < THROTTLE then return end

    local template
    if msgType == "welcome" then
        template = MDGA_Data.autoMessages.welcomeMsg
    elseif msgType == "goodbye" then
        template = MDGA_Data.autoMessages.goodbyeMsg
    end

    if not template or template == "" then return end

    -- Replace template variables
    local msg = template:gsub("%%name%%", playerName or "Unknown")
    msg = msg:gsub("%%guild%%", MDGA_Data.guildInfo and MDGA_Data.guildInfo.name or "the guild")

    SendChatMessage(msg, "GUILD")
    lastMessageTime = now
end
