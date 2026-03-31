-- ================================================
-- MDGA MINIMAP BUTTON
-- Draggable minimap icon. Left-click = toggle GUI,
-- right-click = scan roster.
-- Position saved in MDGA_Data.minimapPos (degrees).
-- ================================================
local addonName, ns = ...

local BUTTON_SIZE = 31
local MINIMAP_RADIUS = 104  -- push outside the minimap circle in modern WoW

-- ── Create the button ──
local btn = CreateFrame("Button", "MDGAMinimapButton", Minimap)
btn:SetSize(BUTTON_SIZE, BUTTON_SIZE)
btn:SetFrameStrata("MEDIUM")
btn:SetFrameLevel(9)
btn:SetClampedToScreen(true)
btn:SetMovable(true)
btn:RegisterForDrag("LeftButton")
btn:RegisterForClicks("AnyUp")

-- Background circle
local bg = btn:CreateTexture(nil, "BACKGROUND")
bg:SetSize(24, 24)
bg:SetPoint("CENTER", 0, 0)
bg:SetTexture("Interface\\MINIMAP\\UI-Minimap-Background")
bg:SetVertexColor(0.2, 0.2, 0.2, 0.8)

-- Icon (numeric ID is always reliable across WoW versions)
local icon = btn:CreateTexture(nil, "ARTWORK")
icon:SetSize(20, 20)
icon:SetPoint("CENTER", 0, 0)
icon:SetTexture(136458) -- INV_Misc_GroupLooking

-- Border ring
local border = btn:CreateTexture(nil, "OVERLAY")
border:SetSize(54, 54)
border:SetPoint("TOPLEFT", btn, "TOPLEFT", 0, 0)
border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")

-- Highlight
local highlight = btn:CreateTexture(nil, "HIGHLIGHT")
highlight:SetSize(24, 24)
highlight:SetPoint("CENTER", 0, 0)
highlight:SetTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")
highlight:SetBlendMode("ADD")

-- Status indicator dot (top-right corner)
local dot = btn:CreateTexture(nil, "OVERLAY", nil, 7)
dot:SetSize(8, 8)
dot:SetPoint("TOPRIGHT", btn, "TOPRIGHT", -4, -4)

-- ── Position helper ──
local function UpdatePosition(degrees)
    local rads = math.rad(degrees or 225)
    local x = math.cos(rads) * MINIMAP_RADIUS
    local y = math.sin(rads) * MINIMAP_RADIUS
    btn:ClearAllPoints()
    btn:SetPoint("CENTER", Minimap, "CENTER", x, y)
end

-- ── Dragging ──
btn:SetScript("OnDragStart", function(self)
    self:SetScript("OnUpdate", function(self)
        local mx, my = Minimap:GetCenter()
        local cx, cy = GetCursorPosition()
        local scale = Minimap:GetEffectiveScale()
        cx, cy = cx / scale, cy / scale
        local degrees = math.deg(math.atan2(cy - my, cx - mx))
        MDGA_Data.minimapPos = degrees
        UpdatePosition(degrees)
    end)
end)

btn:SetScript("OnDragStop", function(self)
    self:SetScript("OnUpdate", nil)
end)

-- ── Tooltip ──
btn:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:ClearLines()
    GameTooltip:AddLine("|cffF5C518MDGA|r Guild Tracker")

    if ns.enabled then
        GameTooltip:AddLine("Status: |cff34D399Active|r")
        dot:SetColorTexture(0.2, 0.83, 0.6, 1)
    else
        GameTooltip:AddLine("Status: |cffB91C1CDisabled|r")
        dot:SetColorTexture(0.73, 0.11, 0.11, 1)
    end

    local rosterCount = 0
    if MDGA_Data and MDGA_Data.roster then
        for _ in pairs(MDGA_Data.roster) do rosterCount = rosterCount + 1 end
    end
    local eventCount = MDGA_Data and MDGA_Data.events and #MDGA_Data.events or 0

    GameTooltip:AddLine(" ")
    GameTooltip:AddDoubleLine("Roster:", rosterCount .. " members", 0.7, 0.7, 0.7, 1, 1, 1)
    GameTooltip:AddDoubleLine("Events:", eventCount .. " pending", 0.7, 0.7, 0.7, 1, 1, 1)
    GameTooltip:AddLine(" ")
    GameTooltip:AddLine("|cff888888Left-click:|r Open panel", 0.7, 0.7, 0.7)
    GameTooltip:AddLine("|cff888888Right-click:|r Scan roster", 0.7, 0.7, 0.7)
    GameTooltip:Show()
end)

btn:SetScript("OnLeave", function()
    GameTooltip:Hide()
end)

-- ── Click handlers ──
btn:SetScript("OnClick", function(self, button)
    if button == "LeftButton" then
        ns:ToggleGUI()
    elseif button == "RightButton" then
        if ns.enabled and IsInGuild() then
            C_GuildInfo.GuildRoster()
            print("|cff34D399[MDGA]|r Roster scan requested.")
        end
    end
end)

-- ── Update status dot colour periodically ──
local dotFrame = CreateFrame("Frame")
local dotTimer = 0
dotFrame:SetScript("OnUpdate", function(self, elapsed)
    dotTimer = dotTimer + elapsed
    if dotTimer >= 5 then
        dotTimer = 0
        if ns.enabled then
            dot:SetColorTexture(0.2, 0.83, 0.6, 1)
        else
            dot:SetColorTexture(0.73, 0.11, 0.11, 1)
        end
    end
end)

-- ── Init: called from Core.lua after SavedVars loaded ──
function ns:InitMinimapButton()
    MDGA_Data.minimapPos = MDGA_Data.minimapPos or 225
    UpdatePosition(MDGA_Data.minimapPos)

    if ns.enabled then
        dot:SetColorTexture(0.2, 0.83, 0.6, 1)
    else
        dot:SetColorTexture(0.73, 0.11, 0.11, 1)
    end

    btn:Show()
end
