module.exports = {
  apps: [{
    name: "chendoc",
    script: "server/dist/server.js",
    cwd: __dirname,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "768M",
    kill_timeout: 10000,
    listen_timeout: 10000,
    time: true,
    merge_logs: true,
    out_file: "logs/chendoc-backend-out.log",
    error_file: "logs/chendoc-backend-error.log",
    env: {
      NODE_ENV: "production",
      CHENDOC_SERVE_ADMIN: "false"
    }
  }]
};
