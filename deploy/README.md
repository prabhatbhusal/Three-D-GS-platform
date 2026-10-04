# Deploying to a VPS

One Linux VPS runs both halves: Next (`next start`, port 3000) and the API
(`server/`, port 4000), kept up by pm2, behind nginx with HTTPS. Scans live
in a Cloudflare R2 bucket (`ASSET_DRIVER=s3`), so the VPS disk only holds
JSON. Every push to `main` that passes CI deploys itself (`.github/workflows/ci.yml`).

**Size:** 2 vCPU, 4 GB RAM, 40+ GB disk, Ubuntu 24.04. `next build` needs
~2–3 GB of RAM; on 2 GB it gets killed half way — add swap if you go smaller.

## 1. Once, on the server (as root)

```sh
adduser --disabled-password deploy
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs nginx git certbot python3-certbot-nginx
npm i -g pm2
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable   # 3000/4000 stay private

mkdir -p /srv/rcaas/data && chown -R deploy: /srv/rcaas
```

## 2. The app (as `deploy`)

```sh
git clone https://github.com/prabhatbhusal/Three-D-GS-platform.git /srv/rcaas/app
cd /srv/rcaas/app
cp -r server/src/data/scenes server/src/data/properties /srv/rcaas/data/   # seed content, first time only
cp server/.env.example server/.env
```

Edit `server/.env`:

```sh
PORT=4000
CLIENT_ORIGIN=https://example.com
DATA_DIR=/srv/rcaas/data          # OUTSIDE the checkout: studio saves must never collide with git pull
SESSION_SECRET=...                # openssl rand -hex 32  (the API refuses to start on the example values)
EMBED_TOKEN_SECRET=...            # openssl rand -hex 32
EDITOR_PASSWORD=...
ASSET_DRIVER=s3                   # + the S3_* values for your R2 bucket
```

Create `/srv/rcaas/app/.env.production` (read at build time):

```sh
NEXT_PUBLIC_API_URL=https://example.com
NEXT_PUBLIC_SITE_URL=https://example.com   # canonical links, sitemap.xml, robots.txt, llms.txt
```

Then:

```sh
bash deploy/deploy.sh
pm2 startup        # prints one sudo command: run it, so both come back after a reboot
```

## 3. nginx + HTTPS (as root)

```sh
cp /srv/rcaas/app/deploy/nginx.conf /etc/nginx/sites-available/rcaas   # set your domain in it
ln -s /etc/nginx/sites-available/rcaas /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d example.com
```

## 4. Automatic deploys from GitHub

On your PC: `ssh-keygen -t ed25519 -f rcaas-deploy -N ""`. Append `rcaas-deploy.pub`
to `/home/deploy/.ssh/authorized_keys` on the server. Then in GitHub →
Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `DEPLOY_SSH_KEY` | contents of `rcaas-deploy` (the private key) |
| Secret | `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan <server-ip>` |
| Variable | `DEPLOY_HOST` | server IP or hostname |
| Variable | `DEPLOY_USER` | `deploy` |
| Variable | `DEPLOY_PATH` | `/srv/rcaas/app` (optional, that's the default) |

Also: Settings → Pages → set Source to **None**. The old "pages-build-deployment"
only ever published the repo's files as a static page, never the app.

## Everyday

- Logs: `pm2 logs`. Status: `pm2 ls`.
- Roll back: `git checkout <good-sha> && bash deploy/deploy.sh`, then `git checkout main` before the next push deploys.
- Back up `/srv/rcaas/data` (users, leads, scenes, reservations) daily — e.g. a cron `tar` pushed to the R2 bucket. The scans themselves are already in R2.
