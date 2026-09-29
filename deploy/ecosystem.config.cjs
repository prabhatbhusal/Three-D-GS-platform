// pm2 keeps both processes up and restarts them on crash or reboot
// (`pm2 startup` once, see deploy/README.md). nginx sits in front of both.
module.exports = {
  apps: [
    {
      name: 'rcaas-web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000 -H 127.0.0.1',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'rcaas-api',
      cwd: 'server',
      script: 'src/index.js', // reads server/.env (PORT=4000, DATA_DIR, secrets)
      env: { NODE_ENV: 'production' }
    }
  ]
};
