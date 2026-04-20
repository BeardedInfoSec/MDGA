-- ================================================
-- MDGA GUI — Tabbed status panel
-- Tabs: Status | Events | Roster | Whisper | Calendar | Bank | Stats | Tools
-- ================================================
local addonName, ns = ...

-- ── Colour constants ──
local C_RED     = { r = 0.73, g = 0.11, b = 0.11 }
local C_GREEN   = { r = 0.20, g = 0.83, b = 0.60 }
local C_GOLD    = { r = 0.96, g = 0.77, b = 0.09 }
local C_WHITE   = { r = 1,    g = 1,    b = 1    }
local C_GREY    = { r = 0.55, g = 0.55, b = 0.55 }
local C_HORDE   = { r = 0.78, g = 0.18, b = 0.18 }
local C_DIM     = { r = 0.35, g = 0.35, b = 0.35 }
local C_CYAN    = { r = 0.30, g = 0.75, b = 0.93 }
local C_BG      = { r = 0.05, g = 0.05, b = 0.05 }
local C_BG_ALT  = { r = 0.10, g = 0.08, b = 0.06 }

local CLASS_DISPLAY_NAMES = {
    WARRIOR     = "Warrior",
    PALADIN     = "Paladin",
    HUNTER      = "Hunter",
    ROGUE       = "Rogue",
    PRIEST      = "Priest",
    DEATHKNIGHT = "Death Knight",
    SHAMAN      = "Shaman",
    MAGE        = "Mage",
    WARLOCK     = "Warlock",
    MONK        = "Monk",
    DRUID       = "Druid",
    DEMONHUNTER = "Demon Hunter",
    EVOKER      = "Evoker",
}

local EVENT_TYPE_LABELS = {
    rank_change = "Rank Change",
    join        = "Joined",
    leave       = "Left",
}

local TAB_HEIGHT = 28
local FRAME_W, FRAME_H = 860, 620
local MIN_FRAME_W, MIN_FRAME_H = 720, 520

-- ================================================================
-- MAIN FRAME
-- ================================================================
local f = CreateFrame("Frame", "MDGAMainFrame", UIParent, "BackdropTemplate")
f:SetSize(FRAME_W, FRAME_H)
f:SetPoint("CENTER")
f:SetMovable(true)
f:EnableMouse(true)
f:RegisterForDrag("LeftButton")
f:SetScript("OnDragStart", f.StartMoving)
f:SetClampedToScreen(true)
f:SetFrameStrata("DIALOG")
if f.SetResizeBounds then
    f:SetResizeBounds(MIN_FRAME_W, MIN_FRAME_H)
else
    if f.SetResizable then f:SetResizable(true) end
    if f.SetMinResize then f:SetMinResize(MIN_FRAME_W, MIN_FRAME_H) end
end

f:SetBackdrop({
    bgFile   = "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
    edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border",
    tile     = true, tileSize = 32, edgeSize = 32,
    insets   = { left = 8, right = 8, top = 8, bottom = 8 },
})
f:SetBackdropColor(C_BG.r, C_BG.g, C_BG.b, 0.97)

local function SaveLayout()
    if not MDGA_Data then return end
    local p, _, rp, x, y = f:GetPoint(1)
    MDGA_Data.guiLayout = MDGA_Data.guiLayout or {}
    MDGA_Data.guiLayout.point = p
    MDGA_Data.guiLayout.relativePoint = rp
    MDGA_Data.guiLayout.x = x
    MDGA_Data.guiLayout.y = y
    MDGA_Data.guiLayout.w = math.floor(f:GetWidth() + 0.5)
    MDGA_Data.guiLayout.h = math.floor(f:GetHeight() + 0.5)
end

local function RestoreLayout()
    if not MDGA_Data or not MDGA_Data.guiLayout then return end
    local lay = MDGA_Data.guiLayout
    if lay.w and lay.h then
        f:SetSize(math.max(MIN_FRAME_W, lay.w), math.max(MIN_FRAME_H, lay.h))
    end
    if lay.point and lay.relativePoint and lay.x and lay.y then
        f:ClearAllPoints()
        f:SetPoint(lay.point, UIParent, lay.relativePoint, lay.x, lay.y)
    end
end

f:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    SaveLayout()
end)

local resize = CreateFrame("Button", nil, f)
resize:SetSize(16, 16)
resize:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -6, 6)
resize:SetNormalTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Up")
resize:SetHighlightTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Highlight")
resize:SetPushedTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Down")
resize:SetScript("OnMouseDown", function()
    f:StartSizing("BOTTOMRIGHT")
end)
resize:SetScript("OnMouseUp", function()
    f:StopMovingOrSizing()
    SaveLayout()
end)

-- Title
local titleBar = CreateFrame("Frame", nil, f, "BackdropTemplate")
titleBar:SetHeight(34)
titleBar:SetPoint("TOPLEFT", f, "TOPLEFT", 10, -10)
titleBar:SetPoint("TOPRIGHT", f, "TOPRIGHT", -10, -10)
titleBar:SetBackdrop({
    bgFile = "Interface\\DialogFrame\\UI-DialogBox-Background",
    tile = true, tileSize = 16,
})
titleBar:SetBackdropColor(C_BG_ALT.r, C_BG_ALT.g, C_BG_ALT.b, 0.9)

local titleText = titleBar:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
titleText:SetPoint("LEFT", 10, 5)
titleText:SetText("|cffB91C1CMDGA|r |cffF5C518Guild Tracker|r")

local subtitleText = titleBar:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
subtitleText:SetPoint("LEFT", 12, -8)
subtitleText:SetText("Officer Command Console")
subtitleText:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)

local versionText = titleBar:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
versionText:SetPoint("RIGHT", -10, 8)
versionText:SetText("v" .. (ns.VERSION or "?"))
versionText:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)

local topStatusText = titleBar:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
topStatusText:SetPoint("RIGHT", -10, -8)
topStatusText:SetTextColor(C_GREEN.r, C_GREEN.g, C_GREEN.b)

local closeBtn = CreateFrame("Button", nil, f, "UIPanelCloseButton")
closeBtn:SetPoint("TOPRIGHT", f, "TOPRIGHT", -4, -4)
closeBtn:SetScript("OnClick", function() f:Hide() end)

-- ================================================================
-- TAB SYSTEM
-- ================================================================
local tabNames = { "Status", "Events", "Roster", "Whisper", "Calendar", "Bank", "Stats", "Tools" }
local tabButtons = {}
local tabFrames = {}
local activeTab = 1

local tabBar = CreateFrame("Frame", nil, f)
tabBar:SetHeight(TAB_HEIGHT + 2)
tabBar:SetPoint("TOPLEFT", titleBar, "BOTTOMLEFT", 0, -4)
tabBar:SetPoint("TOPRIGHT", titleBar, "BOTTOMRIGHT", 0, -4)

local function SetActiveTab(idx)
    activeTab = idx
    for i, btn in ipairs(tabButtons) do
        if i == idx then
            btn:SetBackdropColor(0.2, 0.12, 0.08, 1)
            btn.text:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
            if btn.glow then btn.glow:Show() end
            tabFrames[i]:Show()
        else
            btn:SetBackdropColor(0.08, 0.08, 0.08, 0.8)
            btn.text:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
            if btn.glow then btn.glow:Hide() end
            tabFrames[i]:Hide()
        end
    end
    if ns.RefreshGUI then ns:RefreshGUI() end
end

local tabWidth = (f:GetWidth() - 20) / #tabNames
for i, name in ipairs(tabNames) do
    local btn = CreateFrame("Button", nil, tabBar, "BackdropTemplate")
    btn:SetSize(tabWidth - 2, TAB_HEIGHT)
    btn:SetPoint("TOPLEFT", tabBar, "TOPLEFT", (i - 1) * tabWidth, 0)
    btn:SetBackdrop({
        bgFile   = "Interface\\DialogFrame\\UI-DialogBox-Background",
        edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
        tile     = true, tileSize = 16, edgeSize = 10,
        insets   = { left = 2, right = 2, top = 2, bottom = 2 },
    })
    btn.text = btn:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    btn.text:SetPoint("CENTER")
    btn.text:SetText(name)
    btn.glow = btn:CreateTexture(nil, "ARTWORK")
    btn.glow:SetPoint("BOTTOMLEFT", btn, "BOTTOMLEFT", 3, 2)
    btn.glow:SetPoint("BOTTOMRIGHT", btn, "BOTTOMRIGHT", -3, 2)
    btn.glow:SetHeight(2)
    btn.glow:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.8)
    btn.glow:Hide()

    btn.badge = btn:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    btn.badge:SetPoint("TOPRIGHT", btn, "TOPRIGHT", -4, -3)
    btn.badge:SetTextColor(C_GREEN.r, C_GREEN.g, C_GREEN.b)
    btn.badge:SetText("")

    btn:SetScript("OnEnter", function(self)
        if activeTab ~= i then
            self:SetBackdropColor(0.12, 0.10, 0.08, 0.9)
            self.text:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)
        end
    end)
    btn:SetScript("OnLeave", function(self)
        if activeTab ~= i then
            self:SetBackdropColor(0.08, 0.08, 0.08, 0.8)
            self.text:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
        end
    end)
    btn:SetScript("OnClick", function() SetActiveTab(i) end)
    tabButtons[i] = btn

    local tf = CreateFrame("Frame", nil, f)
    tf:SetPoint("TOPLEFT", tabBar, "BOTTOMLEFT", 0, -6)
    tf:SetPoint("BOTTOMRIGHT", f, "BOTTOMRIGHT", -12, 12)
    tf:Hide()
    tabFrames[i] = tf
end

-- ================================================================
-- HELPERS
-- ================================================================
local CONTENT_WIDTH = FRAME_W - 50

local function MakeSectionHeader(parent, yOffset, text)
    local h = parent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    h:SetPoint("TOPLEFT", parent, "TOPLEFT", 4, yOffset)
    h:SetText(text)
    h:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
    local line = parent:CreateTexture(nil, "ARTWORK")
    line:SetHeight(1)
    line:SetPoint("TOPLEFT", h, "BOTTOMLEFT", 0, -2)
    line:SetPoint("RIGHT", parent, "RIGHT", -4, 0)
    line:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.3)
    return h
end

local function MakeRow(parent, yOffset, labelText)
    local label = parent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    label:SetPoint("TOPLEFT", parent, "TOPLEFT", 10, yOffset)
    label:SetWidth(100)
    label:SetJustifyH("RIGHT")
    label:SetText(labelText)
    label:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
    local value = parent:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    value:SetPoint("LEFT", label, "RIGHT", 8, 0)
    value:SetWidth(340)
    value:SetJustifyH("LEFT")
    value:SetText("\226\128\148")
    return { label = label, value = value }
end

local function MakeButton(parent, xOff, yOff, text, onClick)
    local btn = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
    btn:SetSize(110, 22)
    btn:SetPoint("BOTTOMLEFT", parent, "BOTTOMLEFT", xOff, yOff)
    btn:SetText(text)
    btn:SetScript("OnClick", onClick)
    return btn
end

-- ================================================================
-- TAB 1: STATUS + MOTD
-- ================================================================
local statusTab = tabFrames[1]
local rows = {}
local y = -2

MakeSectionHeader(statusTab, y, "Player")
y = y - 20
rows.status   = MakeRow(statusTab, y, "Active:")
y = y - 16
rows.player   = MakeRow(statusTab, y, "Player:")
y = y - 16
rows.rank     = MakeRow(statusTab, y, "Rank:")
y = y - 16
rows.realm    = MakeRow(statusTab, y, "Realm:")
y = y - 16
rows.spec     = MakeRow(statusTab, y, "Spec:")
y = y - 16
rows.ilvl     = MakeRow(statusTab, y, "Item Level:")
y = y - 16
rows.profs    = MakeRow(statusTab, y, "Professions:")

y = y - 24
MakeSectionHeader(statusTab, y, "Guild")
y = y - 20
rows.guild    = MakeRow(statusTab, y, "Guild:")
y = y - 16
rows.faction  = MakeRow(statusTab, y, "Faction:")
y = y - 16
rows.numRanks = MakeRow(statusTab, y, "Rank Tiers:")

y = y - 24
MakeSectionHeader(statusTab, y, "Data")
y = y - 20
rows.roster   = MakeRow(statusTab, y, "Roster:")
y = y - 16
rows.events   = MakeRow(statusTab, y, "Events:")
y = y - 16
rows.lastScan = MakeRow(statusTab, y, "Last Scan:")
y = y - 16
rows.captured = MakeRow(statusTab, y, "Captured:")

local statusDot = statusTab:CreateTexture(nil, "OVERLAY")
statusDot:SetSize(8, 8)
statusDot:SetPoint("RIGHT", rows.status.value, "LEFT", -3, 0)

-- MOTD section
y = y - 24
MakeSectionHeader(statusTab, y, "Message of the Day")
y = y - 20

local motdDisplay = statusTab:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
motdDisplay:SetPoint("TOPLEFT", statusTab, "TOPLEFT", 14, y)
motdDisplay:SetWidth(400)
motdDisplay:SetJustifyH("LEFT")
motdDisplay:SetWordWrap(true)
motdDisplay:SetText("")
motdDisplay:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)

local motdEditBox = CreateFrame("EditBox", nil, statusTab, "BackdropTemplate")
motdEditBox:SetPoint("TOPLEFT", statusTab, "TOPLEFT", 14, y - 30)
motdEditBox:SetSize(400, 24)
motdEditBox:SetAutoFocus(false)
motdEditBox:SetFontObject(ChatFontNormal)
motdEditBox:SetBackdrop({
    bgFile   = "Interface\\DialogFrame\\UI-DialogBox-Background",
    edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
    tile     = true, tileSize = 16, edgeSize = 10,
    insets   = { left = 4, right = 4, top = 4, bottom = 4 },
})
motdEditBox:SetBackdropColor(0.1, 0.1, 0.1, 1)
motdEditBox:SetTextInsets(6, 6, 2, 2)
motdEditBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)

local motdSetBtn = CreateFrame("Button", nil, statusTab, "UIPanelButtonTemplate")
motdSetBtn:SetSize(80, 22)
motdSetBtn:SetPoint("LEFT", motdEditBox, "RIGHT", 6, 0)
motdSetBtn:SetText("Set MOTD")
motdSetBtn:SetScript("OnClick", function()
    local text = motdEditBox:GetText():trim()
    if ns.SetMOTD then ns:SetMOTD(text) end
    motdEditBox:SetText("")
    motdEditBox:ClearFocus()
end)

MakeButton(statusTab, 10, 4, "Scan Roster", function()
    if ns.enabled and IsInGuild() then
        C_GuildInfo.GuildRoster()
        print("|cff34D399[MDGA]|r Roster scan requested.")
    end
end)

MakeButton(statusTab, 140, 4, "Reset Data", function()
    StaticPopup_Show("MDGA_CONFIRM_RESET")
end)

MakeButton(statusTab, 270, 4, "Refresh", function()
    ns:RefreshGUI()
end)

StaticPopupDialogs["MDGA_CONFIRM_RESET"] = {
    text = "Reset all MDGA addon data?",
    button1 = "Reset", button2 = "Cancel",
    OnAccept = function()
        MDGA_Data.events = {}
        MDGA_Data.roster = {}
        MDGA_Data.calendarEvents = {}
        MDGA_Data.bankLog = {}
        MDGA_Data.lastScanAt = 0
        print("|cff34D399[MDGA]|r Data reset.")
        ns:RefreshGUI()
    end,
    timeout = 0, whileDead = true, hideOnEscape = true, preferredIndex = 3,
}

-- ================================================================
-- TAB 2: EVENT LOG
-- ================================================================
local eventTab = tabFrames[2]

local evtHeader = CreateFrame("Frame", nil, eventTab)
evtHeader:SetHeight(16)
evtHeader:SetPoint("TOPLEFT", eventTab, "TOPLEFT", 0, -2)
evtHeader:SetPoint("TOPRIGHT", eventTab, "TOPRIGHT", 0, -2)

local evtHeaders = { "Time", "Type", "Character", "Details" }
local evtWidths  = { 55, 80, 160, 200 }
local xOff = 4
for i, h in ipairs(evtHeaders) do
    local fs = evtHeader:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    fs:SetPoint("TOPLEFT", evtHeader, "TOPLEFT", xOff, 0)
    fs:SetWidth(evtWidths[i])
    fs:SetJustifyH("LEFT")
    fs:SetText(h)
    fs:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
    xOff = xOff + evtWidths[i]
end

local evtSep = evtHeader:CreateTexture(nil, "ARTWORK")
evtSep:SetHeight(1)
evtSep:SetPoint("TOPLEFT", evtHeader, "BOTTOMLEFT", 0, -1)
evtSep:SetPoint("RIGHT", evtHeader, "RIGHT", 0, 0)
evtSep:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.25)

local evtCountLabel = eventTab:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
evtCountLabel:SetPoint("TOPRIGHT", evtHeader, "TOPRIGHT", -4, 0)
evtCountLabel:SetTextColor(C_GREEN.r, C_GREEN.g, C_GREEN.b)

local evtScroll = CreateFrame("ScrollFrame", "MDGAEventScroll", eventTab, "UIPanelScrollFrameTemplate")
evtScroll:SetPoint("TOPLEFT", evtHeader, "BOTTOMLEFT", 0, -4)
evtScroll:SetPoint("BOTTOMRIGHT", eventTab, "BOTTOMRIGHT", -24, 4)

local evtContent = CreateFrame("Frame", nil, evtScroll)
evtContent:SetWidth(CONTENT_WIDTH)
evtContent:SetHeight(1)
evtScroll:SetScrollChild(evtContent)

local MAX_EVENT_ROWS = 50
local eventRows = {}

local function GetEventDetail(evt)
    local d = evt.data or {}
    if evt.type == "rank_change" then
        local parts = {}
        if d.oldRankName then table.insert(parts, d.oldRankName) end
        table.insert(parts, "->")
        if d.newRankName then table.insert(parts, d.newRankName) end
        if d.promotedBy then table.insert(parts, "(by " .. d.promotedBy .. ")") end
        if d.demotedBy then table.insert(parts, "(by " .. d.demotedBy .. ")") end
        return table.concat(parts, " ")
    elseif evt.type == "leave" and d.kickedBy then
        return "kicked by " .. d.kickedBy
    elseif evt.type == "join" and d.rankName then
        return "as " .. d.rankName
    end
    return d.source or ""
end

local EVENT_TYPE_COLORS = {
    rank_change = { r = 0.96, g = 0.77, b = 0.09 },
    join        = { r = 0.20, g = 0.83, b = 0.60 },
    leave       = { r = 0.73, g = 0.11, b = 0.11 },
}

function ns:RefreshEventLog()
    local events = MDGA_Data and MDGA_Data.events or {}
    local count = math.min(#events, MAX_EVENT_ROWS)
    evtCountLabel:SetText(#events .. " events")

    for i = 1, MAX_EVENT_ROWS do
        if not eventRows[i] then
            local row = CreateFrame("Frame", nil, evtContent)
            row:SetHeight(15)
            row:SetPoint("TOPLEFT", evtContent, "TOPLEFT", 0, -((i - 1) * 15))
            row:SetPoint("RIGHT", evtContent, "RIGHT", 0, 0)
            if i % 2 == 0 then
                local bg = row:CreateTexture(nil, "BACKGROUND")
                bg:SetAllPoints()
                bg:SetColorTexture(1, 1, 1, 0.04)
            end
            row.time = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.time:SetPoint("TOPLEFT", row, "TOPLEFT", 4, 0)
            row.time:SetWidth(evtWidths[1]); row.time:SetJustifyH("LEFT"); row.time:SetWordWrap(false)
            row.type = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.type:SetPoint("LEFT", row.time, "RIGHT", 0, 0)
            row.type:SetWidth(evtWidths[2]); row.type:SetJustifyH("LEFT"); row.type:SetWordWrap(false)
            row.char = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.char:SetPoint("LEFT", row.type, "RIGHT", 0, 0)
            row.char:SetWidth(evtWidths[3]); row.char:SetJustifyH("LEFT"); row.char:SetWordWrap(false)
            row.detail = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.detail:SetPoint("LEFT", row.char, "RIGHT", 0, 0)
            row.detail:SetWidth(evtWidths[4]); row.detail:SetJustifyH("LEFT"); row.detail:SetWordWrap(false)
            eventRows[i] = row
        end
        local row = eventRows[i]
        if i <= count then
            local evt = events[#events - i + 1]
            row.time:SetText(date("%H:%M", evt.timestamp or 0))
            row.time:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
            local typeCol = EVENT_TYPE_COLORS[evt.type] or C_WHITE
            row.type:SetText(EVENT_TYPE_LABELS[evt.type] or evt.type or "?")
            row.type:SetTextColor(typeCol.r, typeCol.g, typeCol.b)
            local charDisplay = (evt.characterName or "?"):match("^([^%-]+)") or evt.characterName or "?"
            row.char:SetText(charDisplay)
            row.char:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)
            row.detail:SetText(GetEventDetail(evt))
            row.detail:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
            row:Show()
        else
            row:Hide()
        end
    end
    evtContent:SetHeight(math.max(1, count * 15))
end

-- ================================================================
-- TAB 3: ROSTER (Online / All / Inactive + Notes + Actions)
-- ================================================================
local rosterTab = tabFrames[3]
local rosterViewMode = "online"

-- Toolbar
local rosterToolbar = CreateFrame("Frame", nil, rosterTab)
rosterToolbar:SetHeight(24)
rosterToolbar:SetPoint("TOPLEFT", rosterTab, "TOPLEFT", 0, -2)
rosterToolbar:SetPoint("TOPRIGHT", rosterTab, "TOPRIGHT", 0, -2)

local rosterViewBtns = {}
local viewModes = { { key = "online", label = "Online" }, { key = "all", label = "All" }, { key = "inactive", label = "Inactive 7d+" } }
for vi, vm in ipairs(viewModes) do
    local vb = CreateFrame("Button", nil, rosterToolbar, "BackdropTemplate")
    vb:SetSize(90, 20)
    vb:SetPoint("TOPLEFT", rosterToolbar, "TOPLEFT", (vi - 1) * 94, 0)
    vb:SetBackdrop({
        bgFile = "Interface\\DialogFrame\\UI-DialogBox-Background",
        edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
        tile = true, tileSize = 16, edgeSize = 8,
        insets = { left = 2, right = 2, top = 2, bottom = 2 },
    })
    vb.text = vb:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    vb.text:SetPoint("CENTER")
    vb.text:SetText(vm.label)
    vb:SetScript("OnClick", function()
        rosterViewMode = vm.key
        for _, b in ipairs(rosterViewBtns) do
            b:SetBackdropColor(0.08, 0.08, 0.08, 0.8)
            b.text:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
        end
        vb:SetBackdropColor(0.2, 0.12, 0.08, 1)
        vb.text:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
        ns:RefreshRosterTab()
    end)
    rosterViewBtns[vi] = vb
end
rosterViewBtns[1]:SetBackdropColor(0.2, 0.12, 0.08, 1)
rosterViewBtns[1].text:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)

-- Search box
local rosterSearch = CreateFrame("EditBox", nil, rosterToolbar, "InputBoxTemplate")
rosterSearch:SetSize(140, 18)
rosterSearch:SetPoint("RIGHT", rosterToolbar, "RIGHT", -4, 0)
rosterSearch:SetAutoFocus(false)
rosterSearch:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
rosterSearch:SetScript("OnTextChanged", function() ns:RefreshRosterTab() end)

local rosterSearchPH = rosterSearch:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
rosterSearchPH:SetPoint("LEFT", rosterSearch, "LEFT", 4, 0)
rosterSearchPH:SetText("Search...")
rosterSearchPH:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
rosterSearch:HookScript("OnTextChanged", function(self)
    if self:GetText() ~= "" then rosterSearchPH:Hide() else rosterSearchPH:Show() end
end)

-- Column headers
local rosterHeader = CreateFrame("Frame", nil, rosterTab)
rosterHeader:SetHeight(16)
rosterHeader:SetPoint("TOPLEFT", rosterToolbar, "BOTTOMLEFT", 0, -4)
rosterHeader:SetPoint("TOPRIGHT", rosterToolbar, "BOTTOMRIGHT", 0, -4)

local rosterColNames  = { "Name", "Class", "Rank", "Lvl", "Zone", "Last Seen", "Note" }
local rosterColWidths = { 130, 80, 85, 30, 90, 70, 140 }
xOff = 4
for i, h in ipairs(rosterColNames) do
    local fs = rosterHeader:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    fs:SetPoint("TOPLEFT", rosterHeader, "TOPLEFT", xOff, 0)
    fs:SetWidth(rosterColWidths[i])
    fs:SetJustifyH("LEFT")
    fs:SetText(h)
    fs:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
    xOff = xOff + rosterColWidths[i]
end

local rosterSep = rosterHeader:CreateTexture(nil, "ARTWORK")
rosterSep:SetHeight(1)
rosterSep:SetPoint("TOPLEFT", rosterHeader, "BOTTOMLEFT", 0, -1)
rosterSep:SetPoint("RIGHT", rosterHeader, "RIGHT", 0, 0)
rosterSep:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.25)

local rosterCountLabel = rosterTab:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
rosterCountLabel:SetPoint("TOPRIGHT", rosterHeader, "TOPRIGHT", -4, 0)
rosterCountLabel:SetTextColor(C_GREEN.r, C_GREEN.g, C_GREEN.b)

-- Action bar
local actionBar = CreateFrame("Frame", nil, rosterTab, "BackdropTemplate")
actionBar:SetHeight(72)
actionBar:SetPoint("BOTTOMLEFT", rosterTab, "BOTTOMLEFT", 0, 0)
actionBar:SetPoint("BOTTOMRIGHT", rosterTab, "BOTTOMRIGHT", 0, 0)
actionBar:SetBackdrop({
    bgFile = "Interface\\DialogFrame\\UI-DialogBox-Background",
    tile = true, tileSize = 16,
})
actionBar:SetBackdropColor(0.1, 0.08, 0.06, 0.9)

local actionSep = actionBar:CreateTexture(nil, "ARTWORK")
actionSep:SetHeight(1)
actionSep:SetPoint("TOPLEFT", actionBar, "TOPLEFT", 0, 0)
actionSep:SetPoint("TOPRIGHT", actionBar, "TOPRIGHT", 0, 0)
actionSep:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.25)

local selectedLabel = actionBar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
selectedLabel:SetPoint("TOPLEFT", actionBar, "TOPLEFT", 6, -6)
selectedLabel:SetWidth(350)
selectedLabel:SetJustifyH("LEFT")
selectedLabel:SetText("|cff888888Click a member to select|r")

local notesLabel = actionBar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
notesLabel:SetPoint("TOPLEFT", actionBar, "TOPLEFT", 6, -20)
notesLabel:SetWidth(350)
notesLabel:SetJustifyH("LEFT")
notesLabel:SetText("")
notesLabel:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)

local noteEditBox = CreateFrame("EditBox", nil, actionBar, "InputBoxTemplate")
noteEditBox:SetSize(220, 18)
noteEditBox:SetPoint("TOPLEFT", actionBar, "TOPLEFT", 400, -10)
noteEditBox:SetAutoFocus(false)
noteEditBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
noteEditBox:Hide()

local noteTypeLabel = actionBar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
noteTypeLabel:SetPoint("RIGHT", noteEditBox, "LEFT", -4, 0)
noteTypeLabel:SetText("")
noteTypeLabel:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
noteTypeLabel:Hide()

local promoteBtn = CreateFrame("Button", nil, actionBar, "UIPanelButtonTemplate")
promoteBtn:SetSize(80, 22)
promoteBtn:SetPoint("BOTTOMLEFT", actionBar, "BOTTOMLEFT", 6, 6)
promoteBtn:SetText("Promote")
promoteBtn:Disable()

local demoteBtn = CreateFrame("Button", nil, actionBar, "UIPanelButtonTemplate")
demoteBtn:SetSize(80, 22)
demoteBtn:SetPoint("LEFT", promoteBtn, "RIGHT", 4, 0)
demoteBtn:SetText("Demote")
demoteBtn:Disable()

local kickBtn = CreateFrame("Button", nil, actionBar, "UIPanelButtonTemplate")
kickBtn:SetSize(70, 22)
kickBtn:SetPoint("LEFT", demoteBtn, "RIGHT", 4, 0)
kickBtn:SetText("Kick")
kickBtn:Disable()

local whisperOneBtn = CreateFrame("Button", nil, actionBar, "UIPanelButtonTemplate")
whisperOneBtn:SetSize(80, 22)
whisperOneBtn:SetPoint("LEFT", kickBtn, "RIGHT", 4, 0)
whisperOneBtn:SetText("Whisper")
whisperOneBtn:Disable()

local editPubNoteBtn = CreateFrame("Button", nil, actionBar, "UIPanelButtonTemplate")
editPubNoteBtn:SetSize(90, 22)
editPubNoteBtn:SetPoint("LEFT", whisperOneBtn, "RIGHT", 4, 0)
editPubNoteBtn:SetText("Edit Note")
editPubNoteBtn:Disable()

local editOffNoteBtn = CreateFrame("Button", nil, actionBar, "UIPanelButtonTemplate")
editOffNoteBtn:SetSize(100, 22)
editOffNoteBtn:SetPoint("LEFT", editPubNoteBtn, "RIGHT", 4, 0)
editOffNoteBtn:SetText("Officer Note")
editOffNoteBtn:Disable()

local selectedMember = nil
local selectedRowIdx = nil
local editingNoteType = nil

local function SelectMember(member, rowIdx)
    selectedMember = member
    selectedRowIdx = rowIdx
    editingNoteType = nil
    noteEditBox:Hide()
    noteTypeLabel:Hide()
    if member then
        local cc = ns.CLASS_COLORS[member.class] or C_WHITE
        local colorHex = string.format("%02x%02x%02x", cc.r * 255, cc.g * 255, cc.b * 255)
        selectedLabel:SetText("Selected: |cff" .. colorHex .. member.name .. "|r  (" .. (member.rankName or "?") .. ")")
        local fullName = member.name .. "-" .. member.realmSlug
        local pubNote, offNote = nil, nil
        if ns.GetMemberNotes then pubNote, offNote = ns:GetMemberNotes(fullName) end
        local noteText = ""
        if pubNote and pubNote ~= "" then noteText = "Note: " .. pubNote end
        if offNote and offNote ~= "" then
            if noteText ~= "" then noteText = noteText .. "  |  " end
            noteText = noteText .. "Officer: " .. offNote
        end
        notesLabel:SetText(noteText)
        promoteBtn:Enable(); demoteBtn:Enable(); kickBtn:Enable()
        whisperOneBtn:Enable(); editPubNoteBtn:Enable(); editOffNoteBtn:Enable()
    else
        selectedLabel:SetText("|cff888888Click a member to select|r")
        notesLabel:SetText("")
        promoteBtn:Disable(); demoteBtn:Disable(); kickBtn:Disable()
        whisperOneBtn:Disable(); editPubNoteBtn:Disable(); editOffNoteBtn:Disable()
    end
end

promoteBtn:SetScript("OnClick", function()
    if selectedMember then
        local fn = selectedMember.name .. "-" .. selectedMember.realmSlug
        ns:ConfirmPromote(fn, selectedMember.name)
    end
end)
demoteBtn:SetScript("OnClick", function()
    if selectedMember then
        local fn = selectedMember.name .. "-" .. selectedMember.realmSlug
        ns:ConfirmDemote(fn, selectedMember.name)
    end
end)
kickBtn:SetScript("OnClick", function()
    if selectedMember then
        local fn = selectedMember.name .. "-" .. selectedMember.realmSlug
        ns:ConfirmKick(fn, selectedMember.name)
    end
end)
whisperOneBtn:SetScript("OnClick", function()
    if selectedMember then
        local fn = selectedMember.name .. "-" .. selectedMember.realmSlug
        ChatFrame_OpenChat("/w " .. fn .. " ", DEFAULT_CHAT_FRAME)
    end
end)
editPubNoteBtn:SetScript("OnClick", function()
    if not selectedMember then return end
    editingNoteType = "public"
    noteTypeLabel:SetText("Public:"); noteTypeLabel:Show()
    noteEditBox:SetText(""); noteEditBox:Show(); noteEditBox:SetFocus()
end)
editOffNoteBtn:SetScript("OnClick", function()
    if not selectedMember then return end
    editingNoteType = "officer"
    noteTypeLabel:SetText("Officer:"); noteTypeLabel:Show()
    noteEditBox:SetText(""); noteEditBox:Show(); noteEditBox:SetFocus()
end)
noteEditBox:SetScript("OnEnterPressed", function(self)
    if selectedMember and editingNoteType then
        local fn = selectedMember.name .. "-" .. selectedMember.realmSlug
        if editingNoteType == "public" then ns:SetPublicNote(fn, self:GetText())
        else ns:SetOfficerNote(fn, self:GetText()) end
    end
    self:SetText(""); self:ClearFocus(); self:Hide(); noteTypeLabel:Hide()
    editingNoteType = nil
    if selectedMember and selectedRowIdx then SelectMember(selectedMember, selectedRowIdx) end
end)

-- Scroll area
local rosterScroll = CreateFrame("ScrollFrame", "MDGARosterScroll", rosterTab, "UIPanelScrollFrameTemplate")
rosterScroll:SetPoint("TOPLEFT", rosterHeader, "BOTTOMLEFT", 0, -4)
rosterScroll:SetPoint("BOTTOMRIGHT", actionBar, "TOPRIGHT", -24, 4)

local rosterContent = CreateFrame("Frame", nil, rosterScroll)
rosterContent:SetWidth(CONTENT_WIDTH)
rosterContent:SetHeight(1)
rosterScroll:SetScrollChild(rosterContent)

local MAX_ROSTER_ROWS = 150
local rosterRows = {}
local rosterSortedData = {}

function ns:RefreshRosterTab()
    local roster = MDGA_Data and MDGA_Data.roster or {}
    local searchText = rosterSearch and rosterSearch:GetText():lower():trim() or ""
    local now = time()
    local INACTIVE_THRESHOLD = 7 * 86400

    local filtered = {}
    for _, m in pairs(roster) do
        local include = false
        if rosterViewMode == "online" then
            include = m.isOnline
        elseif rosterViewMode == "all" then
            include = true
        elseif rosterViewMode == "inactive" then
            local lastSeen = m.lastSeen or 0
            include = (not m.isOnline) and (lastSeen > 0) and ((now - lastSeen) >= INACTIVE_THRESHOLD)
        end
        if include and searchText ~= "" then
            local nm = (m.name or ""):lower():find(searchText, 1, true)
            local cm = (m.class or ""):lower():find(searchText, 1, true)
            local zm = (m.zone or ""):lower():find(searchText, 1, true)
            if not (nm or cm or zm) then include = false end
        end
        if include then table.insert(filtered, m) end
    end

    table.sort(filtered, function(a, b)
        if (a.rankIndex or 99) ~= (b.rankIndex or 99) then
            return (a.rankIndex or 99) < (b.rankIndex or 99)
        end
        return (a.name or "") < (b.name or "")
    end)

    rosterSortedData = filtered
    rosterCountLabel:SetText(#filtered .. " " .. rosterViewMode)

    local count = math.min(#filtered, MAX_ROSTER_ROWS)
    for i = 1, MAX_ROSTER_ROWS do
        if not rosterRows[i] then
            local row = CreateFrame("Button", nil, rosterContent)
            row:SetHeight(15)
            row:SetPoint("TOPLEFT", rosterContent, "TOPLEFT", 0, -((i - 1) * 15))
            row:SetPoint("RIGHT", rosterContent, "RIGHT", 0, 0)
            row:RegisterForClicks("AnyUp")
            if i % 2 == 0 then
                local bg = row:CreateTexture(nil, "BACKGROUND")
                bg:SetAllPoints()
                bg:SetColorTexture(1, 1, 1, 0.05)
            end
            row.highlight = row:CreateTexture(nil, "BACKGROUND", nil, 1)
            row.highlight:SetAllPoints()
            row.highlight:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.15)
            row.highlight:Hide()
            row.name = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.name:SetPoint("TOPLEFT", row, "TOPLEFT", 4, 0)
            row.name:SetWidth(rosterColWidths[1]); row.name:SetJustifyH("LEFT"); row.name:SetWordWrap(false)
            row.class = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.class:SetPoint("LEFT", row.name, "RIGHT", 0, 0)
            row.class:SetWidth(rosterColWidths[2]); row.class:SetJustifyH("LEFT"); row.class:SetWordWrap(false)
            row.rank = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.rank:SetPoint("LEFT", row.class, "RIGHT", 0, 0)
            row.rank:SetWidth(rosterColWidths[3]); row.rank:SetJustifyH("LEFT"); row.rank:SetWordWrap(false)
            row.level = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.level:SetPoint("LEFT", row.rank, "RIGHT", 0, 0)
            row.level:SetWidth(rosterColWidths[4]); row.level:SetJustifyH("CENTER"); row.level:SetWordWrap(false)
            row.zone = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.zone:SetPoint("LEFT", row.level, "RIGHT", 0, 0)
            row.zone:SetWidth(rosterColWidths[5]); row.zone:SetJustifyH("LEFT"); row.zone:SetWordWrap(false)
            row.lastSeen = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.lastSeen:SetPoint("LEFT", row.zone, "RIGHT", 0, 0)
            row.lastSeen:SetWidth(rosterColWidths[6]); row.lastSeen:SetJustifyH("LEFT"); row.lastSeen:SetWordWrap(false)
            row.note = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.note:SetPoint("LEFT", row.lastSeen, "RIGHT", 0, 0)
            row.note:SetWidth(rosterColWidths[7]); row.note:SetJustifyH("LEFT"); row.note:SetWordWrap(false)
            local rowIdx = i
            row:SetScript("OnClick", function()
                if selectedRowIdx and rosterRows[selectedRowIdx] then
                    rosterRows[selectedRowIdx].highlight:Hide()
                end
                if rosterSortedData[rowIdx] then
                    row.highlight:Show()
                    SelectMember(rosterSortedData[rowIdx], rowIdx)
                end
            end)
            row:SetScript("OnEnter", function(self)
                local m = rosterSortedData[rowIdx]
                if not m then return end
                if not self.hoverBg then
                    self.hoverBg = self:CreateTexture(nil, "BACKGROUND", nil, 2)
                    self.hoverBg:SetAllPoints()
                    self.hoverBg:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.06)
                end
                self.hoverBg:Show()
                GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
                local cc = ns.CLASS_COLORS[m.class] or C_WHITE
                local hex = string.format("%02x%02x%02x", cc.r * 255, cc.g * 255, cc.b * 255)
                -- Defensive: strip any stray realm suffix so cross-realm names
                -- never render as "Name-Realm-Realm-Realm" in the tooltip.
                local cleanName = (m.name or "?"):match("^([^%-]+)") or m.name or "?"
                GameTooltip:AddLine("|cff" .. hex .. cleanName .. "|r", 1, 1, 1)
                GameTooltip:AddDoubleLine("Class", CLASS_DISPLAY_NAMES[m.class] or m.class or "?", 0.5, 0.5, 0.5, cc.r, cc.g, cc.b)
                GameTooltip:AddDoubleLine("Level", tostring(m.level or "?"), 0.5, 0.5, 0.5, 1, 1, 1)
                GameTooltip:AddDoubleLine("Rank", (m.rankName or "?") .. " (#" .. tostring(m.rankIndex or "?") .. ")", 0.5, 0.5, 0.5, 1, 1, 1)
                if m.isOnline and m.zone and m.zone ~= "" then
                    GameTooltip:AddDoubleLine("Zone", m.zone, 0.5, 0.5, 0.5, 0.3, 0.8, 0.3)
                end
                GameTooltip:AddLine(" ")
                GameTooltip:AddLine("Click to select", 0.4, 0.4, 0.4)
                GameTooltip:Show()
            end)
            row:SetScript("OnLeave", function(self)
                if self.hoverBg then self.hoverBg:Hide() end
                GameTooltip:Hide()
            end)
            rosterRows[i] = row
        end

        local row = rosterRows[i]
        if i <= count then
            local m = filtered[i]
            local cc = ns.CLASS_COLORS[m.class] or C_WHITE
            local dot = m.isOnline and "|cff34D399\226\128\162|r " or "|cff555555\226\128\162|r "
            local displayName = (m.name or "?"):match("^([^%-]+)") or m.name or "?"
            row.name:SetText(dot .. displayName); row.name:SetTextColor(cc.r, cc.g, cc.b)
            row.class:SetText(CLASS_DISPLAY_NAMES[m.class] or m.class or "?"); row.class:SetTextColor(cc.r, cc.g, cc.b)
            row.rank:SetText(m.rankName or tostring(m.rankIndex or "?"))
            row.rank:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
            row.level:SetText(tostring(m.level or "?")); row.level:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)
            row.zone:SetText(m.isOnline and (m.zone or "") or "")
            row.zone:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
            if m.isOnline then
                row.lastSeen:SetText("Online"); row.lastSeen:SetTextColor(C_GREEN.r, C_GREEN.g, C_GREEN.b)
            elseif m.lastSeen and m.lastSeen > 0 then
                local ago = now - m.lastSeen
                if ago < 3600 then row.lastSeen:SetText(math.floor(ago / 60) .. "m ago")
                elseif ago < 86400 then row.lastSeen:SetText(math.floor(ago / 3600) .. "h ago")
                else row.lastSeen:SetText(math.floor(ago / 86400) .. "d ago") end
                row.lastSeen:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
            else
                row.lastSeen:SetText("?"); row.lastSeen:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
            end
            -- Note column: prefer officer note (gold) over public note (dim).
            local offNote = m.officerNote or ""
            local pubNote = m.publicNote or ""
            if offNote ~= "" then
                row.note:SetText(offNote); row.note:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
            elseif pubNote ~= "" then
                row.note:SetText(pubNote); row.note:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
            else
                row.note:SetText(""); row.note:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
            end
            if selectedRowIdx == i then row.highlight:Show() else row.highlight:Hide() end
            row:Show()
        else
            row.highlight:Hide(); row:Hide()
        end
    end
    rosterContent:SetHeight(math.max(1, count * 15))
end

-- ================================================================
-- TAB 4: MASS WHISPER
-- ================================================================
local whisperTab = tabFrames[4]
local WHISPER_INNER_W = 440
y = -4
MakeSectionHeader(whisperTab, y, "Mass Whisper")
y = y - 22

local msgLabel = whisperTab:CreateFontString(nil, "OVERLAY", "GameFontNormal")
msgLabel:SetPoint("TOPLEFT", whisperTab, "TOPLEFT", 10, y)
msgLabel:SetText("Message:"); msgLabel:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
y = y - 18

local msgBox = CreateFrame("EditBox", "MDGAWhisperInput", whisperTab, "BackdropTemplate")
msgBox:SetPoint("TOPLEFT", whisperTab, "TOPLEFT", 10, y)
msgBox:SetSize(WHISPER_INNER_W, 50)
msgBox:SetMultiLine(true); msgBox:SetMaxLetters(255); msgBox:SetAutoFocus(false)
msgBox:SetFontObject(ChatFontNormal)
msgBox:SetBackdrop({
    bgFile   = "Interface\\DialogFrame\\UI-DialogBox-Background",
    edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
    tile     = true, tileSize = 16, edgeSize = 10,
    insets   = { left = 4, right = 4, top = 4, bottom = 4 },
})
msgBox:SetBackdropColor(0.1, 0.1, 0.1, 1)
msgBox:SetTextInsets(6, 6, 4, 4)
msgBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
y = y - 60

MakeSectionHeader(whisperTab, y, "Filters (optional)")
y = y - 22
local filterInfo = whisperTab:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
filterInfo:SetPoint("TOPLEFT", whisperTab, "TOPLEFT", 10, y)
filterInfo:SetWidth(WHISPER_INNER_W); filterInfo:SetJustifyH("LEFT")
filterInfo:SetText("Leave blank to whisper all online guild members.\nType rank numbers separated by commas (e.g., 0,1,2).")
filterInfo:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
y = y - 30

local rankFilterLabel = whisperTab:CreateFontString(nil, "OVERLAY", "GameFontNormal")
rankFilterLabel:SetPoint("TOPLEFT", whisperTab, "TOPLEFT", 10, y)
rankFilterLabel:SetText("Ranks:"); rankFilterLabel:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)

local rankFilterBox = CreateFrame("EditBox", "MDGAWhisperRankFilter", whisperTab, "InputBoxTemplate")
rankFilterBox:SetPoint("LEFT", rankFilterLabel, "RIGHT", 10, 0)
rankFilterBox:SetSize(120, 20); rankFilterBox:SetAutoFocus(false)
rankFilterBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
y = y - 30

local previewLabel = whisperTab:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
previewLabel:SetPoint("TOPLEFT", whisperTab, "TOPLEFT", 10, y)
previewLabel:SetWidth(WHISPER_INNER_W); previewLabel:SetJustifyH("LEFT")
y = y - 18

local progressBg = CreateFrame("Frame", nil, whisperTab, "BackdropTemplate")
progressBg:SetPoint("TOPLEFT", whisperTab, "TOPLEFT", 10, y)
progressBg:SetSize(WHISPER_INNER_W, 16)
progressBg:SetBackdrop({
    bgFile   = "Interface\\DialogFrame\\UI-DialogBox-Background",
    edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
    tile     = true, tileSize = 16, edgeSize = 8,
    insets   = { left = 2, right = 2, top = 2, bottom = 2 },
})
progressBg:SetBackdropColor(0.1, 0.1, 0.1, 1)

local progressBar = progressBg:CreateTexture(nil, "ARTWORK")
progressBar:SetPoint("TOPLEFT", progressBg, "TOPLEFT", 3, -3)
progressBar:SetHeight(10); progressBar:SetWidth(1)
progressBar:SetColorTexture(C_GREEN.r, C_GREEN.g, C_GREEN.b, 0.8)

local progressText = progressBg:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
progressText:SetPoint("CENTER", progressBg, "CENTER", 0, 0)
progressText:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)

local sendBtn = CreateFrame("Button", nil, whisperTab, "UIPanelButtonTemplate")
sendBtn:SetSize(120, 26); sendBtn:SetPoint("BOTTOMLEFT", whisperTab, "BOTTOMLEFT", 10, 8)
sendBtn:SetText("Send Whispers")

local stopBtn = CreateFrame("Button", nil, whisperTab, "UIPanelButtonTemplate")
stopBtn:SetSize(100, 26); stopBtn:SetPoint("LEFT", sendBtn, "RIGHT", 10, 0)
stopBtn:SetText("Stop")

local previewBtn = CreateFrame("Button", nil, whisperTab, "UIPanelButtonTemplate")
previewBtn:SetSize(100, 26); previewBtn:SetPoint("LEFT", stopBtn, "RIGHT", 10, 0)
previewBtn:SetText("Preview")

local function ParseRankFilter()
    local text = rankFilterBox:GetText():trim()
    if text == "" then return {} end
    local ranks = {}
    for num in text:gmatch("(%d+)") do table.insert(ranks, tonumber(num)) end
    return ranks
end

previewBtn:SetScript("OnClick", function()
    local filters = { ranks = ParseRankFilter() }
    local targets = ns:GetOnlineMembers(filters)
    previewLabel:SetText("|cff34D399" .. #targets .. "|r online members match filters")
end)
sendBtn:SetScript("OnClick", function()
    local message = msgBox:GetText():trim()
    if message == "" then previewLabel:SetText("|cffB91C1CPlease enter a message.|r"); return end
    ns:StartMassWhisper(message, { ranks = ParseRankFilter() })
end)
stopBtn:SetScript("OnClick", function() ns:StopMassWhisper() end)

local PROGRESS_MAX_W = WHISPER_INNER_W - 6

function ns:RefreshWhisperGUI()
    local s = ns:GetWhisperStatus()
    if s.isSending then
        progressText:SetText(s.sent .. " / " .. s.total)
        progressBar:SetWidth(math.max(1, PROGRESS_MAX_W * (s.total > 0 and (s.sent / s.total) or 0)))
        previewLabel:SetText("|cffF5C518Sending...|r " .. s.remaining .. " remaining")
        sendBtn:Disable()
    else
        if s.total > 0 then
            progressText:SetText("Done: " .. s.sent .. " sent")
            progressBar:SetWidth(PROGRESS_MAX_W)
            previewLabel:SetText("|cff34D399Complete!|r " .. s.sent .. " whispers sent.")
        else
            progressText:SetText(""); progressBar:SetWidth(1)
        end
        sendBtn:Enable()
    end
end

function ns:ShowWhisperGUI()
    if not f:IsShown() then f:Show() end
    SetActiveTab(4)
end

-- ================================================================
-- TAB 5: CALENDAR
-- ================================================================
local calendarTab = tabFrames[5]
MakeSectionHeader(calendarTab, -2, "Upcoming Events")

local calCountLabel = calendarTab:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
calCountLabel:SetPoint("TOPRIGHT", calendarTab, "TOPRIGHT", -4, -2)
calCountLabel:SetTextColor(C_GREEN.r, C_GREEN.g, C_GREEN.b)

local calSep = calendarTab:CreateTexture(nil, "ARTWORK")
calSep:SetHeight(1)
calSep:SetPoint("TOPLEFT", calendarTab, "TOPLEFT", 4, -18)
calSep:SetPoint("RIGHT", calendarTab, "RIGHT", -4, 0)
calSep:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.25)

local calScroll = CreateFrame("ScrollFrame", "MDGACalendarScroll", calendarTab, "UIPanelScrollFrameTemplate")
calScroll:SetPoint("TOPLEFT", calendarTab, "TOPLEFT", 0, -22)
calScroll:SetPoint("BOTTOMRIGHT", calendarTab, "BOTTOMRIGHT", -24, 60)

local calContent = CreateFrame("Frame", nil, calScroll)
calContent:SetWidth(CONTENT_WIDTH); calContent:SetHeight(1)
calScroll:SetScrollChild(calContent)

local MAX_CAL_ROWS = 50
local calRows = {}
local CAL_TYPE_COLORS = {
    GUILD_EVENT        = { r = 0.20, g = 0.83, b = 0.60 },
    GUILD_ANNOUNCEMENT = { r = 0.96, g = 0.77, b = 0.09 },
    COMMUNITY_EVENT    = { r = 0.30, g = 0.75, b = 0.93 },
    PLAYER             = { r = 0.70, g = 0.70, b = 0.70 },
}
local WEB_CAT_COLORS = {
    pvp     = { r = 0.90, g = 0.20, b = 0.20 },
    defense = { r = 0.20, g = 0.60, b = 0.90 },
    social  = { r = 0.20, g = 0.83, b = 0.60 },
    raid    = { r = 0.80, g = 0.50, b = 0.90 },
}

function ns:RefreshCalendarTab()
    -- Merge in-game calendar events + website events into one sorted list
    local merged = {}

    local ingame = MDGA_Data and MDGA_Data.calendarEvents or {}
    for _, evt in ipairs(ingame) do
        -- Approximate unix time for sorting
        local approxUnix = time({
            year = evt.year or 2026, month = evt.month or 1, day = evt.day or 1,
            hour = evt.hour or 0, min = evt.minute or 0, sec = 0
        })
        table.insert(merged, {
            title    = evt.title,
            month    = evt.month,
            day      = evt.day,
            hour     = evt.hour,
            minute   = evt.minute,
            sortKey  = approxUnix,
            source   = "ingame",
            badge    = evt.calendarType or "GUILD_EVENT",
            category = nil,
            desc     = nil,
            endHour  = nil,
            endMin   = nil,
        })
    end

    local website = MDGA_Data and MDGA_Data.websiteEvents or {}
    for _, evt in ipairs(website) do
        -- Only show future events
        if (evt.startsUnix or 0) > time() then
            table.insert(merged, {
                title    = evt.title,
                month    = evt.month,
                day      = evt.day,
                hour     = evt.hour,
                minute   = evt.minute,
                sortKey  = evt.startsUnix or 0,
                source   = "website",
                badge    = evt.category or "",
                category = evt.category,
                desc     = evt.description,
                endHour  = evt.endHour,
                endMin   = evt.endMinute,
            })
        end
    end

    table.sort(merged, function(a, b) return a.sortKey < b.sortKey end)

    local count = math.min(#merged, MAX_CAL_ROWS)
    local ingameCount = #ingame
    local webCount = #website
    calCountLabel:SetText(ingameCount .. " in-game, " .. webCount .. " website")

    for i = 1, MAX_CAL_ROWS do
        if not calRows[i] then
            local row = CreateFrame("Frame", nil, calContent)
            row:SetHeight(36)
            row:SetPoint("TOPLEFT", calContent, "TOPLEFT", 0, -((i - 1) * 38))
            row:SetPoint("RIGHT", calContent, "RIGHT", 0, 0)
            if i % 2 == 0 then
                local bg = row:CreateTexture(nil, "BACKGROUND"); bg:SetAllPoints()
                bg:SetColorTexture(1, 1, 1, 0.04)
            end
            -- Source indicator (left edge colored bar)
            row.srcBar = row:CreateTexture(nil, "ARTWORK")
            row.srcBar:SetWidth(3)
            row.srcBar:SetPoint("TOPLEFT", row, "TOPLEFT", 0, 0)
            row.srcBar:SetPoint("BOTTOMLEFT", row, "BOTTOMLEFT", 0, 0)

            row.date = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.date:SetPoint("TOPLEFT", row, "TOPLEFT", 8, -2)
            row.date:SetWidth(80); row.date:SetJustifyH("LEFT")
            row.time = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.time:SetPoint("LEFT", row.date, "RIGHT", 4, 0)
            row.time:SetWidth(80); row.time:SetJustifyH("LEFT")
            row.title = row:CreateFontString(nil, "OVERLAY", "GameFontNormal")
            row.title:SetPoint("TOPLEFT", row, "TOPLEFT", 8, -16)
            row.title:SetWidth(CONTENT_WIDTH - 100); row.title:SetJustifyH("LEFT")
            row.typeBadge = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.typeBadge:SetPoint("TOPRIGHT", row, "TOPRIGHT", -6, -2)
            row.typeBadge:SetJustifyH("RIGHT")
            calRows[i] = row
        end
        local row = calRows[i]
        if i <= count then
            local evt = merged[i]
            row.date:SetText(string.format("%02d/%02d", evt.month or 0, evt.day or 0))
            row.date:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)

            -- Time display: show end time if available
            local timeStr = string.format("%02d:%02d", evt.hour or 0, evt.minute or 0)
            if evt.endHour then
                timeStr = timeStr .. "-" .. string.format("%02d:%02d", evt.endHour, evt.endMin or 0)
            end
            row.time:SetText(timeStr)
            row.time:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)

            row.title:SetText(evt.title or "?")
            row.title:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)

            if evt.source == "website" then
                -- Website event: colored left bar + category badge
                local catColor = WEB_CAT_COLORS[evt.category] or C_DIM
                row.srcBar:SetColorTexture(catColor.r, catColor.g, catColor.b, 1)
                row.srcBar:Show()
                local badgeLabel = (evt.category or "event"):upper()
                row.typeBadge:SetText("[WEB] " .. badgeLabel)
                row.typeBadge:SetTextColor(catColor.r, catColor.g, catColor.b)
            else
                -- In-game event: gold left bar + type badge
                row.srcBar:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.5)
                row.srcBar:Show()
                local typeColor = CAL_TYPE_COLORS[evt.badge] or C_DIM
                local typeLabel = "Event"
                if evt.badge == "GUILD_ANNOUNCEMENT" then typeLabel = "Announce"
                elseif evt.badge == "COMMUNITY_EVENT" then typeLabel = "Community"
                elseif evt.badge == "PLAYER" then typeLabel = "Personal" end
                row.typeBadge:SetText(typeLabel)
                row.typeBadge:SetTextColor(typeColor.r, typeColor.g, typeColor.b)
            end

            -- Tooltip with description on hover
            if evt.desc and evt.desc ~= "" then
                row:EnableMouse(true)
                row:SetScript("OnEnter", function(self)
                    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
                    GameTooltip:AddLine(evt.title, 1, 1, 1)
                    GameTooltip:AddLine(evt.desc, 0.8, 0.8, 0.8, true)
                    GameTooltip:Show()
                end)
                row:SetScript("OnLeave", function() GameTooltip:Hide() end)
            else
                row:EnableMouse(false)
                row:SetScript("OnEnter", nil)
                row:SetScript("OnLeave", nil)
            end

            row:Show()
        else row:Hide() end
    end
    calContent:SetHeight(math.max(1, count * 38))
end

-- Bottom bar: Refresh button + Import button + import editbox
local calBottomBar = CreateFrame("Frame", nil, calendarTab)
calBottomBar:SetHeight(28)
calBottomBar:SetPoint("BOTTOMLEFT", calendarTab, "BOTTOMLEFT", 0, 0)
calBottomBar:SetPoint("BOTTOMRIGHT", calendarTab, "BOTTOMRIGHT", 0, 0)

local calRefreshBtn = CreateFrame("Button", nil, calBottomBar, "UIPanelButtonTemplate")
calRefreshBtn:SetSize(100, 22)
calRefreshBtn:SetPoint("BOTTOMLEFT", calBottomBar, "BOTTOMLEFT", 6, 4)
calRefreshBtn:SetText("Refresh")
calRefreshBtn:SetScript("OnClick", function()
    if ns.RequestCalendarScan then ns:RequestCalendarScan() end
end)

local calImportBtn = CreateFrame("Button", nil, calBottomBar, "UIPanelButtonTemplate")
calImportBtn:SetSize(100, 22)
calImportBtn:SetPoint("LEFT", calRefreshBtn, "RIGHT", 6, 0)
calImportBtn:SetText("Import Events")

-- Import popup
local importPopup = CreateFrame("Frame", "MDGAImportPopup", UIParent, "BasicFrameTemplateWithInset")
importPopup:SetSize(420, 200)
importPopup:SetPoint("CENTER")
importPopup:SetFrameStrata("DIALOG")
importPopup:EnableMouse(true)
importPopup:SetMovable(true)
importPopup:RegisterForDrag("LeftButton")
importPopup:SetScript("OnDragStart", importPopup.StartMoving)
importPopup:SetScript("OnDragStop", importPopup.StopMovingOrSizing)
importPopup:Hide()
importPopup.TitleText:SetText("Import MDGA Website Events")

local importLabel = importPopup:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
importLabel:SetPoint("TOPLEFT", importPopup, "TOPLEFT", 16, -32)
importLabel:SetText("Paste the event string from mdga.dev below:")
importLabel:SetTextColor(0.8, 0.8, 0.8)

local importScroll = CreateFrame("ScrollFrame", "MDGAImportScroll", importPopup, "UIPanelScrollFrameTemplate")
importScroll:SetPoint("TOPLEFT", importPopup, "TOPLEFT", 14, -50)
importScroll:SetPoint("BOTTOMRIGHT", importPopup, "BOTTOMRIGHT", -32, 36)

local importEditBox = CreateFrame("EditBox", "MDGAImportEditBox", importScroll)
importEditBox:SetMultiLine(true)
importEditBox:SetAutoFocus(false)
importEditBox:SetFontObject(ChatFontNormal)
importEditBox:SetWidth(360)
importEditBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
importScroll:SetScrollChild(importEditBox)

local importStatusLabel = importPopup:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
importStatusLabel:SetPoint("BOTTOMLEFT", importPopup, "BOTTOMLEFT", 16, 12)
importStatusLabel:SetTextColor(0.6, 0.6, 0.6)

local importGoBtn = CreateFrame("Button", nil, importPopup, "UIPanelButtonTemplate")
importGoBtn:SetSize(80, 22)
importGoBtn:SetPoint("BOTTOMRIGHT", importPopup, "BOTTOMRIGHT", -10, 8)
importGoBtn:SetText("Import")
importGoBtn:SetScript("OnClick", function()
    local text = importEditBox:GetText()
    if ns.ImportWebsiteEvents then
        local ok, msg = ns:ImportWebsiteEvents(text)
        if ok then
            importStatusLabel:SetText("|cff34D399" .. msg .. "|r")
            C_Timer.After(1.5, function() importPopup:Hide() end)
        else
            importStatusLabel:SetText("|cffFF4444" .. (msg or "Error") .. "|r")
        end
    end
end)

calImportBtn:SetScript("OnClick", function()
    importEditBox:SetText("")
    importStatusLabel:SetText("")
    importPopup:Show()
    importEditBox:SetFocus()
end)

-- ================================================================
-- TAB 6: GUILD BANK
-- ================================================================
local bankTab = tabFrames[6]
MakeSectionHeader(bankTab, -2, "Guild Bank Transactions")

local bankCountLabel = bankTab:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
bankCountLabel:SetPoint("TOPRIGHT", bankTab, "TOPRIGHT", -4, -2)
bankCountLabel:SetTextColor(C_GREEN.r, C_GREEN.g, C_GREEN.b)

local bankInfo = bankTab:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
bankInfo:SetPoint("TOPLEFT", bankTab, "TOPLEFT", 10, -20)
bankInfo:SetWidth(400); bankInfo:SetJustifyH("LEFT")
bankInfo:SetText("Visit the guild bank in-game to capture transaction data.")
bankInfo:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)

local bankSep = bankTab:CreateTexture(nil, "ARTWORK")
bankSep:SetHeight(1)
bankSep:SetPoint("TOPLEFT", bankTab, "TOPLEFT", 4, -34)
bankSep:SetPoint("RIGHT", bankTab, "RIGHT", -4, 0)
bankSep:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.25)

local bankHeader = CreateFrame("Frame", nil, bankTab)
bankHeader:SetHeight(16)
bankHeader:SetPoint("TOPLEFT", bankTab, "TOPLEFT", 0, -38)
bankHeader:SetPoint("TOPRIGHT", bankTab, "TOPRIGHT", 0, -38)

local bankColNames  = { "Type", "Player", "Item / Amount", "Date" }
local bankColWidths = { 70, 110, 250, 80 }
xOff = 4
for i, h in ipairs(bankColNames) do
    local fs = bankHeader:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    fs:SetPoint("TOPLEFT", bankHeader, "TOPLEFT", xOff, 0)
    fs:SetWidth(bankColWidths[i]); fs:SetJustifyH("LEFT"); fs:SetText(h)
    fs:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
    xOff = xOff + bankColWidths[i]
end

local bankScroll = CreateFrame("ScrollFrame", "MDGABankScroll", bankTab, "UIPanelScrollFrameTemplate")
bankScroll:SetPoint("TOPLEFT", bankHeader, "BOTTOMLEFT", 0, -4)
bankScroll:SetPoint("BOTTOMRIGHT", bankTab, "BOTTOMRIGHT", -24, 4)

local bankContent = CreateFrame("Frame", nil, bankScroll)
bankContent:SetWidth(CONTENT_WIDTH); bankContent:SetHeight(1)
bankScroll:SetScrollChild(bankContent)

local MAX_BANK_ROWS = 100
local bankRows = {}
local BANK_TYPE_COLORS = {
    deposit = C_GREEN, withdraw = C_RED, move = C_CYAN,
    repair = { r = 0.96, g = 0.65, b = 0.10 }, buyTab = C_GOLD,
}

function ns:RefreshBankTab()
    local txns = MDGA_Data and MDGA_Data.bankLog or {}
    local count = math.min(#txns, MAX_BANK_ROWS)
    bankCountLabel:SetText(#txns .. " transactions")
    bankInfo:SetText(#txns > 0 and "" or "Visit the guild bank in-game to capture transaction data.")
    for i = 1, MAX_BANK_ROWS do
        if not bankRows[i] then
            local row = CreateFrame("Frame", nil, bankContent)
            row:SetHeight(15)
            row:SetPoint("TOPLEFT", bankContent, "TOPLEFT", 0, -((i - 1) * 15))
            row:SetPoint("RIGHT", bankContent, "RIGHT", 0, 0)
            if i % 2 == 0 then
                local bg = row:CreateTexture(nil, "BACKGROUND"); bg:SetAllPoints()
                bg:SetColorTexture(1, 1, 1, 0.04)
            end
            row.ttype = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.ttype:SetPoint("TOPLEFT", row, "TOPLEFT", 4, 0)
            row.ttype:SetWidth(bankColWidths[1]); row.ttype:SetJustifyH("LEFT")
            row.pname = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.pname:SetPoint("LEFT", row.ttype, "RIGHT", 0, 0)
            row.pname:SetWidth(bankColWidths[2]); row.pname:SetJustifyH("LEFT")
            row.item = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.item:SetPoint("LEFT", row.pname, "RIGHT", 0, 0)
            row.item:SetWidth(bankColWidths[3]); row.item:SetJustifyH("LEFT")
            row.date = row:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
            row.date:SetPoint("LEFT", row.item, "RIGHT", 0, 0)
            row.date:SetWidth(bankColWidths[4]); row.date:SetJustifyH("LEFT")
            bankRows[i] = row
        end
        local row = bankRows[i]
        if i <= count then
            local t = txns[i]
            local tc = BANK_TYPE_COLORS[t.type] or C_WHITE
            row.ttype:SetText(t.type or "?"); row.ttype:SetTextColor(tc.r, tc.g, tc.b)
            row.pname:SetText(t.name or "?"); row.pname:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)
            if t.isMoney then
                row.item:SetText(ns.FormatMoney and ns:FormatMoney(t.amount or 0) or tostring(t.amount or 0))
            else
                local txt = t.itemLink or "?"
                if (t.count or 0) > 1 then txt = txt .. " x" .. t.count end
                row.item:SetText(txt)
            end
            row.item:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)
            row.date:SetText(string.format("%d/%02d/%02d", t.year or 0, t.month or 0, t.day or 0))
            row.date:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
            row:Show()
        else row:Hide() end
    end
    bankContent:SetHeight(math.max(1, count * 15))
end

-- ================================================================
-- TAB 7: STATS (Class Distribution + Zone Heatmap)
-- ================================================================
local statsTab = tabFrames[7]
local statsScroll = CreateFrame("ScrollFrame", "MDGAStatsScroll", statsTab, "UIPanelScrollFrameTemplate")
statsScroll:SetPoint("TOPLEFT", statsTab, "TOPLEFT", 0, -2)
statsScroll:SetPoint("BOTTOMRIGHT", statsTab, "BOTTOMRIGHT", -24, 4)
local statsContent = CreateFrame("Frame", nil, statsScroll)
statsContent:SetWidth(CONTENT_WIDTH); statsContent:SetHeight(1)
statsScroll:SetScrollChild(statsContent)

local statsElements = {}

local function GetHeatColor(pct)
    if pct >= 0.6 then return 0.90, 0.20, 0.15
    elseif pct >= 0.3 then return 0.96, 0.65, 0.10
    elseif pct >= 0.15 then return 0.96, 0.90, 0.20
    else return 0.30, 0.75, 0.93 end
end

function ns:RefreshStatsTab()
    for _, el in ipairs(statsElements) do if el.Hide then el:Hide() end end
    statsElements = {}

    local roster = MDGA_Data and MDGA_Data.roster or {}
    local totalMembers, totalOnline, levelSum = 0, 0, 0
    local classCounts, zoneCounts = {}, {}

    for _, m in pairs(roster) do
        totalMembers = totalMembers + 1
        levelSum = levelSum + (m.level or 0)
        classCounts[m.class or "UNKNOWN"] = (classCounts[m.class or "UNKNOWN"] or 0) + 1
        if m.isOnline then
            totalOnline = totalOnline + 1
            local z = (m.zone and m.zone ~= "") and m.zone or "Unknown"
            zoneCounts[z] = (zoneCounts[z] or 0) + 1
        end
    end

    local yPos = 0
    local BAR_MAX_W = CONTENT_WIDTH - 180

    -- Summary header
    local sh = statsContent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    sh:SetPoint("TOPLEFT", statsContent, "TOPLEFT", 4, yPos)
    sh:SetText("Guild Summary"); sh:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
    table.insert(statsElements, sh)
    yPos = yPos - 16
    local sl = statsContent:CreateTexture(nil, "ARTWORK")
    sl:SetHeight(1); sl:SetPoint("TOPLEFT", statsContent, "TOPLEFT", 4, yPos)
    sl:SetPoint("RIGHT", statsContent, "RIGHT", -4, 0)
    sl:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.3)
    table.insert(statsElements, sl)
    yPos = yPos - 4

    local avgLvl = totalMembers > 0 and math.floor(levelSum / totalMembers) or 0
    local st = statsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    st:SetPoint("TOPLEFT", statsContent, "TOPLEFT", 10, yPos)
    st:SetText("Total: " .. totalMembers .. "  |  Online: " .. totalOnline .. "  |  Avg Level: " .. avgLvl)
    st:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)
    table.insert(statsElements, st)
    yPos = yPos - 24

    -- Class Distribution
    local ch = statsContent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    ch:SetPoint("TOPLEFT", statsContent, "TOPLEFT", 4, yPos)
    ch:SetText("Class Distribution"); ch:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
    table.insert(statsElements, ch)
    yPos = yPos - 16
    local cl = statsContent:CreateTexture(nil, "ARTWORK")
    cl:SetHeight(1); cl:SetPoint("TOPLEFT", statsContent, "TOPLEFT", 4, yPos)
    cl:SetPoint("RIGHT", statsContent, "RIGHT", -4, 0)
    cl:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.3)
    table.insert(statsElements, cl)
    yPos = yPos - 6

    local sortedClasses = {}
    for cls, cnt in pairs(classCounts) do table.insert(sortedClasses, { class = cls, count = cnt }) end
    table.sort(sortedClasses, function(a, b) return a.count > b.count end)
    local maxCC = sortedClasses[1] and sortedClasses[1].count or 1

    for _, data in ipairs(sortedClasses) do
        local cc = ns.CLASS_COLORS[data.class] or C_WHITE
        local lbl = statsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
        lbl:SetPoint("TOPLEFT", statsContent, "TOPLEFT", 10, yPos)
        lbl:SetWidth(100); lbl:SetJustifyH("LEFT"); lbl:SetText(CLASS_DISPLAY_NAMES[data.class] or data.class)
        lbl:SetTextColor(cc.r, cc.g, cc.b)
        table.insert(statsElements, lbl)
        local bar = statsContent:CreateTexture(nil, "ARTWORK")
        bar:SetPoint("LEFT", lbl, "RIGHT", 4, 0)
        bar:SetSize(math.max(4, BAR_MAX_W * (data.count / maxCC)), 12)
        bar:SetColorTexture(cc.r, cc.g, cc.b, 0.6)
        table.insert(statsElements, bar)
        local ct = statsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
        ct:SetPoint("LEFT", bar, "RIGHT", 4, 0)
        ct:SetText(data.count .. " (" .. (totalMembers > 0 and math.floor(data.count / totalMembers * 100) or 0) .. "%)")
        ct:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
        table.insert(statsElements, ct)
        yPos = yPos - 18
    end
    yPos = yPos - 12

    -- Zone Heatmap
    local zh = statsContent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    zh:SetPoint("TOPLEFT", statsContent, "TOPLEFT", 4, yPos)
    zh:SetText("Zone Heatmap (Online)"); zh:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
    table.insert(statsElements, zh)
    yPos = yPos - 16
    local zl = statsContent:CreateTexture(nil, "ARTWORK")
    zl:SetHeight(1); zl:SetPoint("TOPLEFT", statsContent, "TOPLEFT", 4, yPos)
    zl:SetPoint("RIGHT", statsContent, "RIGHT", -4, 0)
    zl:SetColorTexture(C_GOLD.r, C_GOLD.g, C_GOLD.b, 0.3)
    table.insert(statsElements, zl)
    yPos = yPos - 6

    local sortedZones = {}
    for zone, cnt in pairs(zoneCounts) do table.insert(sortedZones, { zone = zone, count = cnt }) end
    table.sort(sortedZones, function(a, b) return a.count > b.count end)
    local maxZC = sortedZones[1] and sortedZones[1].count or 1

    for _, data in ipairs(sortedZones) do
        local lbl = statsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
        lbl:SetPoint("TOPLEFT", statsContent, "TOPLEFT", 10, yPos)
        lbl:SetWidth(110); lbl:SetJustifyH("LEFT"); lbl:SetText(data.zone)
        lbl:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)
        table.insert(statsElements, lbl)
        local pct = data.count / maxZC
        local r, g, b = GetHeatColor(data.count / math.max(totalOnline, 1))
        local bar = statsContent:CreateTexture(nil, "ARTWORK")
        bar:SetPoint("LEFT", lbl, "RIGHT", 4, 0)
        bar:SetSize(math.max(4, BAR_MAX_W * pct), 12)
        bar:SetColorTexture(r, g, b, 0.7)
        table.insert(statsElements, bar)
        local ct = statsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
        ct:SetPoint("LEFT", bar, "RIGHT", 4, 0)
        ct:SetText(tostring(data.count)); ct:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
        table.insert(statsElements, ct)
        yPos = yPos - 20
    end
    if #sortedZones == 0 then
        local nz = statsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
        nz:SetPoint("TOPLEFT", statsContent, "TOPLEFT", 10, yPos)
        nz:SetText("No online members."); nz:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
        table.insert(statsElements, nz)
        yPos = yPos - 16
    end
    statsContent:SetHeight(math.max(1, math.abs(yPos)))
end

-- ================================================================
-- TAB 8: TOOLS (Export, Invite, Auto-Messages, Attendance)
-- ================================================================
local toolsTab = tabFrames[8]
local toolsScroll = CreateFrame("ScrollFrame", "MDGAToolsScroll", toolsTab, "UIPanelScrollFrameTemplate")
toolsScroll:SetPoint("TOPLEFT", toolsTab, "TOPLEFT", 0, -2)
toolsScroll:SetPoint("BOTTOMRIGHT", toolsTab, "BOTTOMRIGHT", -24, 4)
local toolsContent = CreateFrame("Frame", nil, toolsScroll)
toolsContent:SetWidth(CONTENT_WIDTH); toolsContent:SetHeight(800)
toolsScroll:SetScrollChild(toolsContent)

y = 0

-- Export section
MakeSectionHeader(toolsContent, y, "Export Data")
y = y - 22

-- Export popup frame
local exportFrame = CreateFrame("Frame", "MDGAExportFrame", UIParent, "BackdropTemplate")
exportFrame:SetSize(600, 400); exportFrame:SetPoint("CENTER")
exportFrame:SetMovable(true); exportFrame:EnableMouse(true)
exportFrame:RegisterForDrag("LeftButton")
exportFrame:SetScript("OnDragStart", exportFrame.StartMoving)
exportFrame:SetScript("OnDragStop", exportFrame.StopMovingOrSizing)
exportFrame:SetClampedToScreen(true); exportFrame:SetFrameStrata("FULLSCREEN_DIALOG")
exportFrame:SetBackdrop({
    bgFile   = "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
    edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border",
    tile     = true, tileSize = 32, edgeSize = 32,
    insets   = { left = 8, right = 8, top = 8, bottom = 8 },
})
exportFrame:SetBackdropColor(0.05, 0.05, 0.05, 0.98)
exportFrame:Hide()

local expTitle = exportFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
expTitle:SetPoint("TOP", exportFrame, "TOP", 0, -16)
expTitle:SetText("Export"); expTitle:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
local expClose = CreateFrame("Button", nil, exportFrame, "UIPanelCloseButton")
expClose:SetPoint("TOPRIGHT", exportFrame, "TOPRIGHT", -4, -4)
expClose:SetScript("OnClick", function() exportFrame:Hide() end)
local expScroll = CreateFrame("ScrollFrame", "MDGAExportScroll", exportFrame, "UIPanelScrollFrameTemplate")
expScroll:SetPoint("TOPLEFT", exportFrame, "TOPLEFT", 16, -40)
expScroll:SetPoint("BOTTOMRIGHT", exportFrame, "BOTTOMRIGHT", -32, 40)
local expEB = CreateFrame("EditBox", nil, expScroll)
expEB:SetMultiLine(true); expEB:SetAutoFocus(false)
expEB:SetFontObject(GameFontHighlightSmall); expEB:SetWidth(550)
expEB:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
expScroll:SetScrollChild(expEB)
local expHint = exportFrame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
expHint:SetPoint("BOTTOM", exportFrame, "BOTTOM", 0, 16)
expHint:SetText("Press Ctrl+A to select all, then Ctrl+C to copy.")
expHint:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)

local function ShowExportPopup(title, text)
    expTitle:SetText(title); expEB:SetText(text); expEB:SetCursorPosition(0)
    exportFrame:Show(); expEB:SetFocus(); expEB:HighlightText()
end

local exportRosterBtn = CreateFrame("Button", nil, toolsContent, "UIPanelButtonTemplate")
exportRosterBtn:SetSize(130, 22)
exportRosterBtn:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y)
exportRosterBtn:SetText("Export Roster CSV")
exportRosterBtn:SetScript("OnClick", function()
    local roster = MDGA_Data and MDGA_Data.roster or {}
    local lines = { "Name,Realm,Class,Level,Rank,RankIndex,Online,Zone,LastSeen" }
    local sorted = {}
    for _, m in pairs(roster) do table.insert(sorted, m) end
    table.sort(sorted, function(a, b) return (a.name or "") < (b.name or "") end)
    for _, m in ipairs(sorted) do
        table.insert(lines, string.format("%s,%s,%s,%d,%s,%d,%s,%s,%s",
            m.name or "", m.realmSlug or "", m.class or "", m.level or 0,
            m.rankName or "", m.rankIndex or 0, m.isOnline and "Yes" or "No",
            m.zone or "", m.lastSeen and date("%Y-%m-%d %H:%M", m.lastSeen) or ""))
    end
    ShowExportPopup("Export Roster (" .. #sorted .. " members)", table.concat(lines, "\n"))
end)

local exportEventsBtn = CreateFrame("Button", nil, toolsContent, "UIPanelButtonTemplate")
exportEventsBtn:SetSize(130, 22)
exportEventsBtn:SetPoint("LEFT", exportRosterBtn, "RIGHT", 8, 0)
exportEventsBtn:SetText("Export Events CSV")
exportEventsBtn:SetScript("OnClick", function()
    local events = MDGA_Data and MDGA_Data.events or {}
    local lines = { "Timestamp,Type,Character,Realm,Details" }
    for i = #events, 1, -1 do
        local evt = events[i]
        table.insert(lines, string.format("%s,%s,%s,%s,%s",
            date("%Y-%m-%d %H:%M:%S", evt.timestamp or 0),
            evt.type or "", evt.characterName or "", evt.realmSlug or "",
            GetEventDetail(evt):gsub(",", ";")))
    end
    ShowExportPopup("Export Events (" .. #events .. ")", table.concat(lines, "\n"))
end)

-- Export the roster as JSON for the website Reconciliation tab's paste-ingest.
-- Includes officer/public notes and lastSeen so they reach the reconciliation
-- dashboard without the companion app.
local exportJsonBtn = CreateFrame("Button", nil, toolsContent, "UIPanelButtonTemplate")
exportJsonBtn:SetSize(130, 22)
exportJsonBtn:SetPoint("LEFT", exportEventsBtn, "RIGHT", 8, 0)
exportJsonBtn:SetText("Export JSON (site)")
exportJsonBtn:SetScript("OnClick", function()
    local roster = MDGA_Data and MDGA_Data.roster or {}
    local guildInfo = MDGA_Data and MDGA_Data.guildInfo or {}

    local function esc(s)
        s = tostring(s or "")
        s = s:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n"):gsub("\r", "\\r"):gsub("\t", "\\t")
        return s
    end

    local parts = {}
    table.insert(parts, '{"guildInfo":{"name":"' .. esc(guildInfo.name or "") .. '","faction":"' .. esc(guildInfo.faction or "") .. '"},"roster":[')

    local first = true
    local count = 0
    for _, m in pairs(roster) do
        if not first then table.insert(parts, ",") end
        first = false
        count = count + 1
        table.insert(parts, string.format(
            '{"name":"%s","realmSlug":"%s","rankName":"%s","rankIndex":%d,"officerNote":"%s","publicNote":"%s","lastSeen":%d}',
            esc(m.name), esc(m.realmSlug), esc(m.rankName or ""), tonumber(m.rankIndex) or 0,
            esc(m.officerNote or ""), esc(m.publicNote or ""), tonumber(m.lastSeen) or 0
        ))
    end
    table.insert(parts, "]}")

    ShowExportPopup("Site Reconciliation JSON (" .. count .. " members)", table.concat(parts, ""))
end)

-- Generate Report → stages the full roster into MDGA_Data.pendingReport,
-- warns with a countdown, then /reload so SavedVariables flush to disk.
-- The companion app watches the file and writes a CSV to the user's Desktop.
local genReportBtn = CreateFrame("Button", nil, toolsContent, "UIPanelButtonTemplate")
genReportBtn:SetSize(180, 22)
genReportBtn:SetPoint("LEFT", exportJsonBtn, "RIGHT", 8, 0)
genReportBtn:SetText("Generate Report (CSV)")
genReportBtn:SetScript("OnClick", function()
    if InCombatLockdown and InCombatLockdown() then
        print("|cffff5555[MDGA]|r Cannot generate report while in combat. Try again after.")
        return
    end

    -- Stage the report payload inside MDGA_Data so one SV file covers everything.
    local roster = MDGA_Data and MDGA_Data.roster or {}
    local rosterList = {}
    for _, m in pairs(roster) do
        table.insert(rosterList, {
            name        = m.name,
            realmSlug   = m.realmSlug,
            class       = m.class,
            level       = m.level,
            rankIndex   = m.rankIndex,
            rankName    = m.rankName,
            isOnline    = m.isOnline or false,
            zone        = m.zone or "",
            lastSeen    = m.lastSeen or 0,
            publicNote  = m.publicNote or "",
            officerNote = m.officerNote or "",
        })
    end
    MDGA_Data.pendingReport = {
        generatedAt = time(),
        generatedBy = MDGA_Data.playerInfo and MDGA_Data.playerInfo.name or "",
        guildInfo   = MDGA_Data.guildInfo or {},
        roster      = rosterList,
    }

    -- Self-owned countdown overlay (avoids touching Blizzard's RaidWarningFrame,
    -- which can taint secure calls and surface as "Interface action failed
    -- because of an addon" when ReloadUI fires).
    if not ns.reportCountdownFrame then
        local f = CreateFrame("Frame", "MDGAReportCountdown", UIParent)
        f:SetSize(420, 60)
        f:SetPoint("TOP", UIParent, "TOP", 0, -160)
        f:SetFrameStrata("FULLSCREEN_DIALOG")
        f.bg = f:CreateTexture(nil, "BACKGROUND")
        f.bg:SetAllPoints()
        f.bg:SetColorTexture(0, 0, 0, 0.75)
        f.text = f:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
        f.text:SetPoint("CENTER")
        f.text:SetTextColor(1, 0.6, 0.1)
        f:Hide()
        ns.reportCountdownFrame = f
    end
    local overlay = ns.reportCountdownFrame
    overlay:Show()
    print("|cffff9900[MDGA]|r Generating roster report — UI will reload in 5 seconds.")

    local countdown = 5
    local function tick()
        if countdown <= 0 then
            overlay:Hide()
            C_Timer.After(0, function() ReloadUI() end)
            return
        end
        overlay.text:SetText("[MDGA] Generating report — reloading in " .. countdown .. "s")
        countdown = countdown - 1
        C_Timer.After(1, tick)
    end
    tick()
end)
y = y - 36

-- Invite Tool section
MakeSectionHeader(toolsContent, y, "Guild Invite Tool")
y = y - 20
local invInfo = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
invInfo:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y)
invInfo:SetWidth(400); invInfo:SetJustifyH("LEFT")
invInfo:SetText("Enter character names (one per line) to batch-invite.")
invInfo:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
y = y - 16

local invBox = CreateFrame("EditBox", nil, toolsContent, "BackdropTemplate")
invBox:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y)
invBox:SetSize(300, 60); invBox:SetMultiLine(true); invBox:SetAutoFocus(false)
invBox:SetFontObject(ChatFontNormal)
invBox:SetBackdrop({
    bgFile   = "Interface\\DialogFrame\\UI-DialogBox-Background",
    edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
    tile     = true, tileSize = 16, edgeSize = 10,
    insets   = { left = 4, right = 4, top = 4, bottom = 4 },
})
invBox:SetBackdropColor(0.1, 0.1, 0.1, 1)
invBox:SetTextInsets(6, 6, 4, 4)
invBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
y = y - 66

local invStatus = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
invStatus:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y)
invStatus:SetWidth(300); invStatus:SetJustifyH("LEFT")
invStatus:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)

local invStartBtn = CreateFrame("Button", nil, toolsContent, "UIPanelButtonTemplate")
invStartBtn:SetSize(100, 22)
invStartBtn:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 320, y + 14)
invStartBtn:SetText("Start Invite")
invStartBtn:SetScript("OnClick", function()
    local text = invBox:GetText():trim()
    if text == "" then invStatus:SetText("|cffB91C1CEnter at least one name.|r"); return end
    local names = {}
    for line in text:gmatch("[^\r\n]+") do
        local t = line:trim()
        if t ~= "" then table.insert(names, t) end
    end
    ns:StartBatchInvite(names)
end)

local invStopBtn = CreateFrame("Button", nil, toolsContent, "UIPanelButtonTemplate")
invStopBtn:SetSize(80, 22); invStopBtn:SetPoint("LEFT", invStartBtn, "RIGHT", 6, 0)
invStopBtn:SetText("Stop")
invStopBtn:SetScript("OnClick", function() ns:StopBatchInvite() end)
y = y - 30

-- Auto-Messages section
MakeSectionHeader(toolsContent, y, "Auto-Messages (Guild Chat)")
y = y - 22

local amCB = CreateFrame("CheckButton", nil, toolsContent, "UICheckButtonTemplate")
amCB:SetSize(24, 24); amCB:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 8, y)
local amLabel = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
amLabel:SetPoint("LEFT", amCB, "RIGHT", 2, 0)
amLabel:SetText("Enable auto welcome/goodbye messages")
amLabel:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)
y = y - 28

local welLabel = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
welLabel:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y)
welLabel:SetText("Welcome:"); welLabel:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
local welBox = CreateFrame("EditBox", nil, toolsContent, "InputBoxTemplate")
welBox:SetPoint("LEFT", welLabel, "RIGHT", 8, 0)
welBox:SetSize(350, 20); welBox:SetAutoFocus(false)
welBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
y = y - 24

local byeLabel = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
byeLabel:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y)
byeLabel:SetText("Goodbye:"); byeLabel:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)
local byeBox = CreateFrame("EditBox", nil, toolsContent, "InputBoxTemplate")
byeBox:SetPoint("LEFT", byeLabel, "RIGHT", 8, 0)
byeBox:SetSize(350, 20); byeBox:SetAutoFocus(false)
byeBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
y = y - 20

local tplHint = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
tplHint:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y)
tplHint:SetText("Use %name% for player name, %guild% for guild name.")
tplHint:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
y = y - 18

local amSaveBtn = CreateFrame("Button", nil, toolsContent, "UIPanelButtonTemplate")
amSaveBtn:SetSize(100, 22); amSaveBtn:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y)
amSaveBtn:SetText("Save")
amSaveBtn:SetScript("OnClick", function()
    MDGA_Data.autoMessages = MDGA_Data.autoMessages or {}
    MDGA_Data.autoMessages.enabled = amCB:GetChecked() and true or false
    MDGA_Data.autoMessages.welcomeMsg = welBox:GetText()
    MDGA_Data.autoMessages.goodbyeMsg = byeBox:GetText()
    print("|cff34D399[MDGA]|r Auto-message settings saved.")
end)
y = y - 36

-- Attendance Tracker section
MakeSectionHeader(toolsContent, y, "Attendance Tracker")
y = y - 22

local attCB = CreateFrame("CheckButton", nil, toolsContent, "UICheckButtonTemplate")
attCB:SetSize(24, 24); attCB:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 8, y)
local attLabel = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
attLabel:SetPoint("LEFT", attCB, "RIGHT", 2, 0)
attLabel:SetText("Enable attendance recording during raid hours")
attLabel:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)
y = y - 28

local dayLabels = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" }
local dayCBs = {}
local rdLabel = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
rdLabel:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y + 2)
rdLabel:SetText("Raid Days:"); rdLabel:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)

for di, dn in ipairs(dayLabels) do
    local cb = CreateFrame("CheckButton", nil, toolsContent, "UICheckButtonTemplate")
    cb:SetSize(20, 20); cb:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 80 + (di - 1) * 52, y)
    local dl = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    dl:SetPoint("LEFT", cb, "RIGHT", 1, 0)
    dl:SetText(dn); dl:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b)
    dayCBs[di] = cb
end
y = y - 28

local hrLabel = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
hrLabel:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y)
hrLabel:SetText("Hours:"); hrLabel:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)

local startHrBox = CreateFrame("EditBox", nil, toolsContent, "InputBoxTemplate")
startHrBox:SetPoint("LEFT", hrLabel, "RIGHT", 8, 0)
startHrBox:SetSize(40, 20); startHrBox:SetAutoFocus(false); startHrBox:SetNumeric(true)
startHrBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)

local toL = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
toL:SetPoint("LEFT", startHrBox, "RIGHT", 6, 0)
toL:SetText("to"); toL:SetTextColor(C_GREY.r, C_GREY.g, C_GREY.b)

local endHrBox = CreateFrame("EditBox", nil, toolsContent, "InputBoxTemplate")
endHrBox:SetPoint("LEFT", toL, "RIGHT", 6, 0)
endHrBox:SetSize(40, 20); endHrBox:SetAutoFocus(false); endHrBox:SetNumeric(true)
endHrBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)

local hrHint = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
hrHint:SetPoint("LEFT", endHrBox, "RIGHT", 8, 0)
hrHint:SetText("(server time, 0-23)"); hrHint:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
y = y - 28

local attSaveBtn = CreateFrame("Button", nil, toolsContent, "UIPanelButtonTemplate")
attSaveBtn:SetSize(100, 22); attSaveBtn:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y)
attSaveBtn:SetText("Save")
attSaveBtn:SetScript("OnClick", function()
    local cfg = MDGA_Data.attendanceConfig or {}
    cfg.enabled = attCB:GetChecked() and true or false
    cfg.raidDays = {}
    for di = 1, 7 do if dayCBs[di]:GetChecked() then cfg.raidDays[di] = true end end
    cfg.startHour = tonumber(startHrBox:GetText()) or 19
    cfg.endHour = tonumber(endHrBox:GetText()) or 23
    MDGA_Data.attendanceConfig = cfg
    print("|cff34D399[MDGA]|r Attendance settings saved.")
end)
y = y - 30

local attSummary = toolsContent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
attSummary:SetPoint("TOPLEFT", toolsContent, "TOPLEFT", 10, y)
attSummary:SetWidth(500); attSummary:SetJustifyH("LEFT")
attSummary:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)

local function RefreshToolsTab()
    local am = MDGA_Data and MDGA_Data.autoMessages or {}
    amCB:SetChecked(am.enabled or false)
    welBox:SetText(am.welcomeMsg or "Welcome to the guild, %name%!")
    byeBox:SetText(am.goodbyeMsg or "%name% has left us. /salute")
    local ac = MDGA_Data and MDGA_Data.attendanceConfig or {}
    attCB:SetChecked(ac.enabled or false)
    for di = 1, 7 do dayCBs[di]:SetChecked(ac.raidDays and ac.raidDays[di] or false) end
    startHrBox:SetText(tostring(ac.startHour or 19))
    endHrBox:SetText(tostring(ac.endHour or 23))
    local att = MDGA_Data and MDGA_Data.attendance or {}
    local dc = 0
    for _ in pairs(att) do dc = dc + 1 end
    attSummary:SetText("Attendance data: " .. dc .. " days recorded.")
    if ns.GetInviteStatus then
        local is = ns:GetInviteStatus()
        if is.isInviting then invStatus:SetText("|cffF5C518Inviting...|r " .. is.sent .. "/" .. is.total)
        elseif is.total > 0 then invStatus:SetText("|cff34D399Done:|r " .. is.sent .. " invited.")
        else invStatus:SetText("") end
    end
end

-- ================================================================
-- REFRESH ALL
-- ================================================================
function ns:RefreshGUI()
    if not f:IsShown() then return end
    if not MDGA_Data then return end

    local pi = MDGA_Data.playerInfo or {}
    local gi = MDGA_Data.guildInfo or {}

    if ns.enabled then
        rows.status.value:SetText("ACTIVE")
        rows.status.value:SetTextColor(C_GREEN.r, C_GREEN.g, C_GREEN.b)
        statusDot:SetColorTexture(C_GREEN.r, C_GREEN.g, C_GREEN.b, 1)
        topStatusText:SetText("ACTIVE")
        topStatusText:SetTextColor(C_GREEN.r, C_GREEN.g, C_GREEN.b)
    else
        rows.status.value:SetText("DISABLED")
        rows.status.value:SetTextColor(C_RED.r, C_RED.g, C_RED.b)
        statusDot:SetColorTexture(C_RED.r, C_RED.g, C_RED.b, 1)
        topStatusText:SetText("DISABLED")
        topStatusText:SetTextColor(C_RED.r, C_RED.g, C_RED.b)
    end

    rows.player.value:SetText(pi.name or "Unknown")
    rows.rank.value:SetText((pi.rankName or "?") .. " (#" .. tostring(pi.rankIndex or "?") .. ")")
    rows.realm.value:SetText(pi.realm or pi.realmSlug or "?")
    rows.spec.value:SetText(pi.spec or "None")
    rows.ilvl.value:SetText(tostring(pi.itemLevel or 0))

    local profText = "None"
    if pi.professions and #pi.professions > 0 then
        local parts = {}
        for _, p in ipairs(pi.professions) do
            table.insert(parts, p.name .. " (" .. p.level .. "/" .. p.maxLevel .. ")")
        end
        profText = table.concat(parts, ", ")
    end
    rows.profs.value:SetText(profText)

    rows.guild.value:SetText(gi.name or "None")
    local faction = gi.faction or "?"
    rows.faction.value:SetText(faction)
    if faction == "Horde" then rows.faction.value:SetTextColor(C_HORDE.r, C_HORDE.g, C_HORDE.b)
    else rows.faction.value:SetTextColor(0.2, 0.4, 0.8) end
    rows.numRanks.value:SetText(tostring(gi.numRanks or "?"))

    local rc = 0
    if MDGA_Data.roster then for _ in pairs(MDGA_Data.roster) do rc = rc + 1 end end
    rows.roster.value:SetText(rc .. " members")

    local ec = MDGA_Data.events and #MDGA_Data.events or 0
    rows.events.value:SetText(ec .. " pending")
    if ec > 0 then rows.events.value:SetTextColor(C_GOLD.r, C_GOLD.g, C_GOLD.b)
    else rows.events.value:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b) end

    if MDGA_Data.lastScanAt and MDGA_Data.lastScanAt > 0 then
        rows.lastScan.value:SetText(date("%H:%M:%S", MDGA_Data.lastScanAt))
    else rows.lastScan.value:SetText("Never") end

    if MDGA_Data.capturedAt and MDGA_Data.capturedAt > 0 then
        rows.captured.value:SetText(date("%H:%M:%S", MDGA_Data.capturedAt))
    else rows.captured.value:SetText("Not yet") end

    if ns.GetMOTD then
        local motd = ns:GetMOTD()
        motdDisplay:SetText(motd ~= "" and motd or "(no MOTD set)")
        if motd == "" then motdDisplay:SetTextColor(C_DIM.r, C_DIM.g, C_DIM.b)
        else motdDisplay:SetTextColor(C_WHITE.r, C_WHITE.g, C_WHITE.b) end
    end

    -- Update tab badges
    local onlineCount = 0
    if MDGA_Data.roster then
        for _, m in pairs(MDGA_Data.roster) do
            if m.isOnline then onlineCount = onlineCount + 1 end
        end
    end
    tabButtons[2].badge:SetText(ec > 0 and tostring(ec) or "")
    tabButtons[3].badge:SetText(onlineCount > 0 and tostring(onlineCount) or "")
    local calC = (MDGA_Data.calendarEvents and #MDGA_Data.calendarEvents or 0)
              + (MDGA_Data.websiteEvents and #MDGA_Data.websiteEvents or 0)
    tabButtons[5].badge:SetText(calC > 0 and tostring(calC) or "")
    local bankC = MDGA_Data.bankLog and #MDGA_Data.bankLog or 0
    tabButtons[6].badge:SetText(bankC > 0 and tostring(bankC) or "")

    if activeTab == 2 then ns:RefreshEventLog() end
    if activeTab == 3 then ns:RefreshRosterTab() end
    if activeTab == 4 then ns:RefreshWhisperGUI() end
    if activeTab == 5 then ns:RefreshCalendarTab() end
    if activeTab == 6 then ns:RefreshBankTab() end
    if activeTab == 7 then ns:RefreshStatsTab() end
    if activeTab == 8 then RefreshToolsTab() end
end

function ns:ToggleGUI()
    if f:IsShown() then f:Hide() else f:Show() end
end

f:SetScript("OnShow", function()
    RestoreLayout()
    ns:RefreshGUI()
end)

local refreshTimer = 0
local timerFrame = CreateFrame("Frame")
timerFrame:SetScript("OnUpdate", function(self, elapsed)
    if not f:IsShown() then return end
    refreshTimer = refreshTimer + elapsed
    if refreshTimer >= 10 then
        refreshTimer = 0
        ns:RefreshGUI()
    end
end)

f:Hide()
table.insert(UISpecialFrames, "MDGAMainFrame")
SetActiveTab(1)
