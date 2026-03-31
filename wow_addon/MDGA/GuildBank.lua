-- ================================================
-- MDGA GUILD BANK MONITOR
-- Captures guild bank transaction logs when the
-- player visits the guild bank. Stores in MDGA_Data.bankLog.
-- Guild bank APIs live in Blizzard_GuildBankUI (load-on-demand),
-- so we always register events and check API availability at runtime.
-- ================================================
local addonName, ns = ...

function ns:ScanBankLog()
    if not ns.enabled then return end

    -- Guild bank APIs may not exist until the LoD addon loads
    if not GetNumGuildBankTabs then return end

    MDGA_Data.bankLog = MDGA_Data.bankLog or {}

    local transactions = {}

    local numTabs = GetNumGuildBankTabs()
    -- Item transactions per tab
    for tab = 1, numTabs do
        if GetNumGuildBankTransactions and GetGuildBankTransaction then
            local numTrans = GetNumGuildBankTransactions(tab)
            for i = 1, numTrans do
                local transType, name, itemLink, count, tab1, tab2, year, month, day, hour = GetGuildBankTransaction(tab, i)
                if name then
                    table.insert(transactions, {
                        type     = transType or "unknown",
                        name     = name,
                        itemLink = itemLink,
                        count    = count or 0,
                        tab      = tab,
                        year     = year or 0,
                        month    = month or 0,
                        day      = day or 0,
                        hour     = hour or 0,
                    })
                end
            end
        end
    end

    -- Money transactions
    if GetNumGuildBankMoneyTransactions and GetGuildBankMoneyTransaction then
        local numMoney = GetNumGuildBankMoneyTransactions()
        for i = 1, numMoney do
            local transType, name, amount, year, month, day, hour = GetGuildBankMoneyTransaction(i)
            if name then
                table.insert(transactions, {
                    type    = transType or "unknown",
                    name    = name,
                    amount  = amount or 0,
                    isMoney = true,
                    year    = year or 0,
                    month   = month or 0,
                    day     = day or 0,
                    hour    = hour or 0,
                })
            end
        end
    end

    -- Sort by date descending (most recent first)
    table.sort(transactions, function(a, b)
        if a.year ~= b.year then return a.year > b.year end
        if a.month ~= b.month then return a.month > b.month end
        if a.day ~= b.day then return a.day > b.day end
        return a.hour > b.hour
    end)

    -- Cap at 200 entries
    while #transactions > 200 do
        table.remove(transactions)
    end

    MDGA_Data.bankLog = transactions
    print("|cff34D399[MDGA]|r Guild bank log captured: " .. #transactions .. " transactions.")

    if ns.RefreshGUI then ns:RefreshGUI() end
end

-- ── Event listener ──
-- Always register events — the guild bank LoD addon may not be loaded yet,
-- but these events only fire once the bank frame opens (which loads the LoD addon).
local bankFrame = CreateFrame("Frame")
pcall(function() bankFrame:RegisterEvent("GUILDBANKFRAME_OPENED") end)
pcall(function() bankFrame:RegisterEvent("GUILD_BANK_LOG_UPDATE") end)
pcall(function() bankFrame:RegisterEvent("GUILD_BANK_FRAME_OPENED") end)

local pendingQueries = false

bankFrame:SetScript("OnEvent", function(self, event)
    if not ns.enabled then return end

    if event == "GUILDBANKFRAME_OPENED" or event == "GUILD_BANK_FRAME_OPENED" then
        -- By now the LoD addon is loaded, so APIs should exist
        if QueryGuildBankLog and GetNumGuildBankTabs then
            local numTabs = GetNumGuildBankTabs()
            for tab = 1, numTabs do
                QueryGuildBankLog(tab)
            end
        end
        pendingQueries = true

    elseif event == "GUILD_BANK_LOG_UPDATE" then
        if pendingQueries then
            pendingQueries = false
            ns:ScanBankLog()
        end
    end
end)

-- Format money (copper → gold/silver/copper display string)
function ns:FormatMoney(copper)
    if not copper or copper == 0 then return "0c" end
    local gold = math.floor(copper / 10000)
    local silver = math.floor((copper % 10000) / 100)
    local cop = copper % 100
    local parts = {}
    if gold > 0 then table.insert(parts, "|cffFFD700" .. gold .. "g|r") end
    if silver > 0 then table.insert(parts, "|cffC0C0C0" .. silver .. "s|r") end
    if cop > 0 then table.insert(parts, "|cffB87333" .. cop .. "c|r") end
    return table.concat(parts, " ")
end
