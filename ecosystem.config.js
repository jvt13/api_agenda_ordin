module.exports = {
  apps: [
    {
      name: 'api-ordin-flow',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'whisper-stt',
      script: 'services/stt/start.sh',
      interpreter: 'bash',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      time: true,
    },
  ],
};
