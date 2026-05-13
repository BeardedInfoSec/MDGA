// ================================================
// MDGA COMPANION — First-run setup wizard
// Interactive prompts for serverUrl, token, wowPath, accountName.
// Auto-detects WoW install path and lists WTF/Account folders so the
// officer never has to type a path or copy a folder name by hand.
// ================================================
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync } = require('child_process');

const DEFAULT_SERVER = 'https://mdga.gg';
const DEFAULT_WOW_PATHS = [
  'C:\\Program Files (x86)\\World of Warcraft\\_retail_',
  'C:\\Program Files\\World of Warcraft\\_retail_',
  'D:\\World of Warcraft\\_retail_',
  'D:\\Program Files (x86)\\World of Warcraft\\_retail_',
];

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, (answer) => resolve(answer)));
}

// Try the registry first (Battle.net writes the install path here), then fall
// back to scanning common drive locations.
function detectWowPath() {
  const regKeys = [
    'HKLM\\Software\\Wow6432Node\\Blizzard Entertainment\\World of Warcraft',
    'HKLM\\Software\\Blizzard Entertainment\\World of Warcraft',
  ];
  for (const key of regKeys) {
    const r = spawnSync('reg.exe', ['query', key, '/v', 'InstallPath'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout) {
      const m = r.stdout.match(/InstallPath\s+REG_SZ\s+(.+)/);
      if (m) {
        const base = m[1].trim().replace(/\\?$/, '');
        const retail = path.join(base, '_retail_');
        if (fs.existsSync(path.join(retail, 'Wow.exe')) || fs.existsSync(retail)) return retail;
        if (fs.existsSync(path.join(base, 'Wow.exe')) || fs.existsSync(base)) return base;
      }
    }
  }
  for (const p of DEFAULT_WOW_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function listAccountFolders(wowPath) {
  const accountDir = path.join(wowPath, 'WTF', 'Account');
  if (!fs.existsSync(accountDir)) return [];
  return fs.readdirSync(accountDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name);
}

async function pickAccount(rl, wowPath) {
  const accounts = listAccountFolders(wowPath);
  if (accounts.length === 0) {
    console.log(`\n  ! No accounts found in ${path.join(wowPath, 'WTF', 'Account')}.`);
    console.log('  ! Log into WoW at least once with the MDGA addon enabled, then re-run setup.\n');
    const manual = (await ask(rl, '  Type the account folder name manually: ')).trim();
    return manual || null;
  }
  if (accounts.length === 1) {
    console.log(`\n  Found 1 account: ${accounts[0]} (using it automatically)`);
    return accounts[0];
  }
  console.log('\n  Found multiple WoW account folders:');
  accounts.forEach((a, i) => console.log(`    ${i + 1}) ${a}`));
  while (true) {
    const choice = (await ask(rl, `  Pick account [1-${accounts.length}]: `)).trim();
    const n = parseInt(choice, 10);
    if (Number.isFinite(n) && n >= 1 && n <= accounts.length) return accounts[n - 1];
    console.log('  Invalid selection, try again.');
  }
}

async function runWizard(configPath) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('');
  console.log('================================================');
  console.log('  MDGA Companion — First-time setup');
  console.log('================================================');
  console.log('  This will create config.json so the companion');
  console.log('  knows where WoW is installed and how to talk');
  console.log('  to the website.');
  console.log('================================================');
  console.log('');

  // Server URL
  const serverInput = (await ask(rl, `  Server URL [${DEFAULT_SERVER}]: `)).trim();
  const serverUrl = serverInput || DEFAULT_SERVER;

  // Token — instructions are explicit so non-techies can find it.
  console.log('');
  console.log('  Companion token:');
  console.log(`  1. Open ${serverUrl}/profile in a browser and log in`);
  console.log('  2. Click "Generate Companion Token" (or copy the JWT from sessionStorage)');
  console.log('  3. Paste the full token below');
  let token = '';
  while (!token) {
    token = (await ask(rl, '  Paste token: ')).trim();
    if (!token) console.log('  Token cannot be empty. Try again.');
  }

  // WoW path — auto-detect first.
  const detected = detectWowPath();
  console.log('');
  if (detected) {
    console.log(`  Detected WoW install at: ${detected}`);
    const ok = (await ask(rl, '  Use this path? [Y/n]: ')).trim().toLowerCase();
    var wowPath = (ok === '' || ok === 'y' || ok === 'yes') ? detected : null;
  }
  while (!wowPath) {
    const p = (await ask(rl, '  Enter WoW _retail_ folder path: ')).trim().replace(/^"|"$/g, '');
    if (p && fs.existsSync(p)) {
      wowPath = p;
    } else {
      console.log(`  Path does not exist: ${p}`);
    }
  }

  // Account folder — pick from a list.
  const accountName = await pickAccount(rl, wowPath);
  if (!accountName) {
    console.log('  ! Setup cannot continue without an account name. Exiting.');
    rl.close();
    process.exit(1);
  }

  rl.close();

  const config = {
    serverUrl,
    token,
    wowPath: wowPath.replace(/\\/g, '/'),
    accountName,
    pollIntervalMs: 5000,
    debug: false,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log('');
  console.log(`  ✓ Saved config to: ${configPath}`);
  console.log('');
  return config;
}

module.exports = { runWizard, detectWowPath, listAccountFolders };
