module.exports = {
  apps: [
    {
      name: 'mdga',
      script: 'server/index.js',
      // Pin the Node interpreter so pm2 doesn't fall back to the system /usr/bin/node
      // (Node 12 on this host), which cannot parse modern syntax (e.g. optional chaining).
      // Override via PM2_INTERPRETER env var if the nvm path changes.
      interpreter: process.env.PM2_INTERPRETER || '/home/mdga/.nvm/versions/node/v24.12.0/bin/node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      // Restart with exponential backoff on crash (1s, 2s, 4s... up to 15s)
      exp_backoff_restart_delay: 1000,
      // Logs
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
