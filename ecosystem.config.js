module.exports = {
  apps: [
    {
      name: 'mdga',
      script: 'server/index.js',
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
