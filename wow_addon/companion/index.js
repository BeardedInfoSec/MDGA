#!/usr/bin/env node
// ================================================
// MDGA COMPANION APP
// Watches WoW SavedVariables file, parses Lua data,
// POSTs new events/roster to the MDGA server.
// Officer-only: hard-stops if playerInfo.rankIndex > 2.
// ================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chokidar = require('chokidar');
const fetch = require('node-fetch');
const { parseLuaFile } = require('./lua-parser');

// ── Load config ──
const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('[MDGA] config.json not found. Copy config.example.json to config.json and fill in your settings.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

if (!config.serverUrl || !config.token || !config.wowPath || !config.accountName) {
  console.error('[MDGA] config.json is incomplete. Required: serverUrl, token, wowPath, accountName');
  process.exit(1);
}

// ── Constants ──
const OFFICER_RANK_THRESHOLD = 2;
const SAVED_VARS_PATH = path.join(
  config.wowPath, 'WTF', 'Account', config.accountName,
  'SavedVariables', 'MDGA.lua'
);
const STATE_FILE = path.join(__dirname, 'companion-state.json');
const QUEUE_FILE = path.join(__dirname, 'companion-queue.json');
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const BASE_RETRY_DELAY_MS = 5000;

// ── State management ──
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastSyncedEventId: null, lastRosterHash: null, lastSyncTimestamp: 0 };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Queue management (for retry on failure) ──
function loadQueue() {
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

// ── Roster hashing for change detection ──
function hashRoster(roster) {
  if (!roster || typeof roster !== 'object') return 'empty';
  const keys = Object.keys(roster).sort();
  const parts = keys.map((k) => {
    const m = roster[k];
    return `${k}:${m.rankIndex}:${m.level}:${m.class}`;
  });
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').substring(0, 16);
}

// ── POST to server ──
let retryCount = 0;

async function postToServer(payload) {
  const res = await fetch(`${config.serverUrl}/api/addon/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    },
    body: JSON.stringify(payload),
    timeout: 30000,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Server responded ${res.status}: ${body}`);
  }

  return res.json();
}

// ── Process SavedVariables file ──
async function processFile() {
  if (!fs.existsSync(SAVED_VARS_PATH)) {
    if (config.debug) console.log('[MDGA] SavedVariables file not found yet.');
    return;
  }

  let parsed;
  try {
    parsed = parseLuaFile(SAVED_VARS_PATH);
  } catch (err) {
    console.error('[MDGA] Failed to parse SavedVariables:', err.message);
    return;
  }

  const data = parsed?.MDGA_Data;
  if (!data) {
    if (config.debug) console.log('[MDGA] MDGA_Data not found in SavedVariables.');
    return;
  }

  if (data.version !== 3) {
    console.log(`[MDGA] Unsupported schema version: ${data.version}. Expected 3.`);
    return;
  }

  // ── OFFICER CHECK (companion-level hard stop) ──
  const rankIndex = data.playerInfo?.rankIndex;
  if (rankIndex === undefined || rankIndex === null || rankIndex > OFFICER_RANK_THRESHOLD) {
    console.log(`[MDGA] BLOCKED: Player rank ${rankIndex} exceeds officer threshold (${OFFICER_RANK_THRESHOLD}). Upload denied.`);
    return;
  }

  const state = loadState();

  // ── Determine which events are new ──
  let newEvents = data.events || [];
  if (state.lastSyncedEventId && Array.isArray(newEvents)) {
    const idx = newEvents.findIndex((e) => e.id === state.lastSyncedEventId);
    if (idx >= 0) {
      newEvents = newEvents.slice(idx + 1);
    }
    // If not found, send all (events were trimmed or first sync)
  }

  // ── Determine if roster changed ──
  const currentRosterHash = hashRoster(data.roster);
  const rosterChanged = currentRosterHash !== state.lastRosterHash;

  // ── Skip if nothing new ──
  if (newEvents.length === 0 && !rosterChanged) {
    if (config.debug) console.log('[MDGA] No changes to sync.');
    return;
  }

  // ── Build payload ──
  const payload = {
    addonVersion: data.addonVersion,
    schemaVersion: data.version,
    capturedBy: data.capturedBy,
    capturedAt: data.capturedAt,
    guildInfo: data.guildInfo,
    playerInfo: data.playerInfo,
    roster: rosterChanged ? Object.values(data.roster || {}) : undefined,
    events: newEvents.length > 0 ? newEvents : undefined,
    rosterIncluded: rosterChanged,
  };

  // ── Attempt upload ──
  try {
    const result = await postToServer(payload);
    console.log(`[MDGA] Sync success: events=${result.eventsProcessed || 0}, roster=${result.rosterProcessed || 0}, rankChanges=${result.rankChangesTriggered || 0}`);

    // Update state
    const allEvents = data.events || [];
    state.lastSyncedEventId = allEvents.length > 0 ? allEvents[allEvents.length - 1].id : state.lastSyncedEventId;
    state.lastRosterHash = currentRosterHash;
    state.lastSyncTimestamp = Date.now();
    saveState(state);

    retryCount = 0; // reset backoff

    // Drain any queued payloads
    await drainQueue();
  } catch (err) {
    console.error(`[MDGA] Sync failed: ${err.message}`);

    // Queue the payload for retry
    const queue = loadQueue();
    queue.push({ payload, queuedAt: Date.now() });
    // Keep max 50 queued payloads
    while (queue.length > 50) queue.shift();
    saveQueue(queue);

    // Schedule retry with exponential backoff
    retryCount++;
    const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCount - 1), MAX_RETRY_DELAY_MS);
    console.log(`[MDGA] Will retry in ${Math.round(delay / 1000)}s (attempt ${retryCount})`);
    setTimeout(drainQueue, delay);
  }
}

async function drainQueue() {
  const queue = loadQueue();
  if (queue.length === 0) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const result = await postToServer(item.payload);
      console.log(`[MDGA] Queue item synced: events=${result.eventsProcessed || 0}`);
    } catch (err) {
      console.error(`[MDGA] Queue item failed: ${err.message}`);
      remaining.push(item);
    }
  }

  saveQueue(remaining);
  if (remaining.length === 0) {
    retryCount = 0;
  }
}

// ── Main ──
console.log(`[MDGA] Companion app v1.0.0`);
console.log(`[MDGA] Watching: ${SAVED_VARS_PATH}`);
console.log(`[MDGA] Server: ${config.serverUrl}`);

// Watch the SavedVariables file
const watcher = chokidar.watch(SAVED_VARS_PATH, {
  persistent: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000, // wait 2s after last write
    pollInterval: 500,
  },
  ignoreInitial: false,
});

watcher.on('add', () => {
  console.log('[MDGA] SavedVariables file detected.');
  processFile();
});

watcher.on('change', () => {
  console.log('[MDGA] SavedVariables changed, syncing...');
  processFile();
});

watcher.on('error', (err) => {
  console.error('[MDGA] Watcher error:', err.message);
});

// Run initial sync after 2 seconds
setTimeout(processFile, 2000);
