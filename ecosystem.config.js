module.exports = {
  apps: [
    {
      name: 'social-backend', // keep your original app name
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '600M',

      // Loads your .env file automatically
      env_file: '.env',

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Log files (logs folder we created on server)
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Graceful restart for Fastify
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
