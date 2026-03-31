-- ================================================
-- MDGA CALENDAR TRACKER
-- Scans in-game guild calendar + imported MDGA website events.
-- Stores results in MDGA_Data.calendarEvents + MDGA_Data.websiteEvents.
-- Alerts players before events start.
-- ================================================
local addonName, ns = ...

local lastScanTime = 0
local SCAN_COOLDOWN = 5  -- seconds between scans
local pendingRefresh = false  -- waiting for async data

-- Alert config (minutes before event to warn)
local ALERT_MINUTES = { 15, 5 }  -- alert at 15 min and 5 min before
local alertedEvents = {}  -- track which alerts already fired: ["title_timestamp_minutes"] = true

-- Event types we care about (skip holidays and raid resets)
local WANTED_TYPES = {
    GUILD_EVENT        = true,
    GUILD_ANNOUNCEMENT = true,
    COMMUNITY_EVENT    = true,
    PLAYER             = true,  -- officer-created personal events
}

-- Category display names/colors for website events
ns.CATEGORY_COLORS = {
    pvp     = { r = 0.90, g = 0.20, b = 0.20 },
    defense = { r = 0.20, g = 0.60, b = 0.90 },
    social  = { r = 0.20, g = 0.83, b = 0.60 },
    raid    = { r = 0.80, g = 0.50, b = 0.90 },
}

local function ScanDayEvents(events, monthOffset, day, month, year)
    local numEvents = C_Calendar.GetNumDayEvents(monthOffset, day)
    for i = 1, numEvents do
        local event = C_Calendar.GetDayEvent(monthOffset, day, i)
        if event and event.title and WANTED_TYPES[event.calendarType] then
            local startTime = event.startTime or {}
            table.insert(events, {
                title        = event.title,
                month        = month,
                day          = day,
                year         = year,
                hour         = startTime.hour or 0,
                minute       = startTime.minute or 0,
                calendarType = event.calendarType,
                source       = "ingame",
            })
        end
    end
end

function ns:ScanCalendarEvents()
    if not ns.enabled then return end

    MDGA_Data.calendarEvents = MDGA_Data.calendarEvents or {}
    local events = {}

    local now = C_DateAndTime.GetCurrentCalendarTime()
    if not now then
        ns:Print("Calendar: could not get current time")
        return
    end

    local today = now.monthDay
    local monthInfo = C_Calendar.GetMonthInfo(0)
    if not monthInfo then
        ns:Print("Calendar: could not get month info — data may not be loaded yet")
        return
    end

    -- Scan remaining days in current month
    for day = today, monthInfo.numDays do
        ScanDayEvents(events, 0, day, now.month, now.year)
    end

    -- Scan first 14 days of next month
    local nextInfo = C_Calendar.GetMonthInfo(1)
    if nextInfo then
        local scanDays = math.min(14, nextInfo.numDays)
        for day = 1, scanDays do
            ScanDayEvents(events, 1, day, nextInfo.month, nextInfo.year)
        end
    end

    MDGA_Data.calendarEvents = events
    lastScanTime = time()
    pendingRefresh = false

    local webCount = MDGA_Data.websiteEvents and #MDGA_Data.websiteEvents or 0
    ns:Print("Calendar: " .. #events .. " in-game, " .. webCount .. " website events")
    if ns.RefreshGUI then ns:RefreshGUI() end
end

-- Request calendar data and scan when it arrives (async-safe)
function ns:RequestCalendarScan()
    if not ns.enabled then return end
    pendingRefresh = true
    C_Calendar.OpenCalendar()
    -- Data arrives async via CALENDAR_UPDATE_EVENT_LIST
    -- Fallback: if the event doesn't fire within 3s, scan anyway
    C_Timer.After(3, function()
        if pendingRefresh then
            ns:ScanCalendarEvents()
        end
    end)
end

-- ================================================
-- WEBSITE EVENT IMPORT
-- Format: !MDGA-EVT1!title\tstarts_unix\tends_unix\tcategory\tdesc\n...!END!
-- ================================================
function ns:ImportWebsiteEvents(importStr)
    if not importStr or importStr == "" then
        ns:Print("Import: empty string")
        return false, "Empty import string"
    end

    -- Validate wrapper
    local payload = importStr:match("^!MDGA%-EVT1!(.*)!END!$")
    if not payload then
        ns:Print("Import: invalid format (missing header/footer)")
        return false, "Invalid format — must start with !MDGA-EVT1! and end with !END!"
    end

    if payload == "" then
        MDGA_Data.websiteEvents = {}
        ns:Print("Import: no events (calendar cleared)")
        if ns.RefreshGUI then ns:RefreshGUI() end
        return true, "No events to import"
    end

    local events = {}
    for line in payload:gmatch("[^\n]+") do
        local title, startsStr, endsStr, category, desc = strsplit("\t", line)
        local startsUnix = tonumber(startsStr) or 0
        local endsUnix = tonumber(endsStr) or 0

        if title and title ~= "" and startsUnix > 0 then
            -- Convert unix timestamp to date components
            local startDate = date("*t", startsUnix)
            local endDate = endsUnix > 0 and date("*t", endsUnix) or nil

            table.insert(events, {
                title       = title,
                month       = startDate.month,
                day         = startDate.day,
                year        = startDate.year,
                hour        = startDate.hour,
                minute      = startDate.min,
                endHour     = endDate and endDate.hour or nil,
                endMinute   = endDate and endDate.min or nil,
                category    = category or "",
                description = desc or "",
                startsUnix  = startsUnix,
                endsUnix    = endsUnix,
                source      = "website",
            })
        end
    end

    -- Sort by start time
    table.sort(events, function(a, b) return a.startsUnix < b.startsUnix end)

    MDGA_Data.websiteEvents = events
    ns:Print("Import: loaded " .. #events .. " website events")
    if ns.RefreshGUI then ns:RefreshGUI() end
    return true, #events .. " events imported"
end

-- ================================================
-- EVENT ALERTS
-- Checks website events and fires alerts before they start
-- ================================================
local function CheckEventAlerts()
    if not ns.enabled then return end
    local events = MDGA_Data.websiteEvents
    if not events or #events == 0 then return end

    local now = time()

    for _, evt in ipairs(events) do
        if evt.startsUnix and evt.startsUnix > now then
            local secsUntil = evt.startsUnix - now
            local minsUntil = math.ceil(secsUntil / 60)

            for _, alertMin in ipairs(ALERT_MINUTES) do
                local alertKey = evt.title .. "_" .. evt.startsUnix .. "_" .. alertMin
                if not alertedEvents[alertKey] and minsUntil <= alertMin then
                    alertedEvents[alertKey] = true

                    -- Chat alert
                    local catColor = ns.CATEGORY_COLORS[evt.category] or { r = 1, g = 1, b = 1 }
                    local hexColor = string.format("%02x%02x%02x",
                        math.floor(catColor.r * 255),
                        math.floor(catColor.g * 255),
                        math.floor(catColor.b * 255))

                    print("|cffF5C518[MDGA ALERT]|r |cff" .. hexColor .. evt.title .. "|r starts in |cffF5C518" .. minsUntil .. " minute(s)|r!")

                    -- Raid warning text (top of screen)
                    if RaidNotice_AddMessage then
                        RaidNotice_AddMessage(RaidWarningFrame,
                            "|cffB91C1C[MDGA]|r " .. evt.title .. " in " .. minsUntil .. " min!",
                            ChatTypeInfo["RAID_WARNING"])
                    end

                    -- Play sound
                    PlaySound(8959, "Master") -- RAID_WARNING sound
                end
            end
        end
    end
end

-- Start alert ticker (runs every 30 seconds)
local alertTicker = nil
function ns:StartEventAlerts()
    if alertTicker then return end
    alertTicker = C_Timer.NewTicker(30, CheckEventAlerts)
    -- Run once immediately
    C_Timer.After(1, CheckEventAlerts)
end

function ns:StopEventAlerts()
    if alertTicker then
        alertTicker:Cancel()
        alertTicker = nil
    end
end

-- ── Event listener — scan when calendar data is ready ──
local calFrame = CreateFrame("Frame")
calFrame:RegisterEvent("CALENDAR_UPDATE_EVENT_LIST")
calFrame:RegisterEvent("PLAYER_ENTERING_WORLD")
calFrame:SetScript("OnEvent", function(self, event)
    if not ns.enabled then return end

    if event == "PLAYER_ENTERING_WORLD" then
        -- Request calendar data after a short delay (async)
        C_Timer.After(5, function()
            if ns.enabled then
                ns:RequestCalendarScan()
                ns:StartEventAlerts()
            end
        end)
    elseif event == "CALENDAR_UPDATE_EVENT_LIST" then
        if (time() - lastScanTime) >= SCAN_COOLDOWN then
            ns:ScanCalendarEvents()
        end
    end
end)
