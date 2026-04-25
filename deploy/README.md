# Deployment Guide — analyzemyexpenses.net

## 1. Provision a VPS

Recommended: **Hetzner CX22** (~€4/mo, 2 vCPU, 4 GB RAM, 40 GB SSD)
- https://console.hetzner.cloud → New Project → Add Server
- Location: Ashburn (US East) or Helsinki
- Image: Ubuntu 24.04
- Add your SSH key
- Note the server's public IP address

## 2. Point DNS

In your domain registrar → DNS → Manage:
- Add **A record**: `@` → your server IP (TTL 600)
- Add **A record**: `www` → your server IP (TTL 600)

DNS propagation takes ~10–30 min. Test with: `nslookup analyzemyexpenses.net`

## 3. Initial server setup

SSH in as root:
```bash
ssh root@<your-server-ip>
```

Update and install dependencies:
```bash
apt update && apt upgrade -y
apt install -y nginx python3 python3-pip python3-venv python3-dev \
    build-essential libsqlcipher-dev certbot python3-certbot-nginx git
```

Create app directory and user permissions:
```bash
mkdir -p /opt/analyzemyexpenses
useradd -r -s /bin/false www-data 2>/dev/null || true
chown -R www-data:www-data /opt/analyzemyexpenses
```

## 4. Create the environment file

On the server, create `/etc/analyzemyexpenses.env` with your secrets:
```bash
cat > /etc/analyzemyexpenses.env << 'EOF'
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
ANTHROPIC_API_KEY=sk-ant-...
EOF
chmod 600 /etc/analyzemyexpenses.env
```

- `GMAIL_APP_PASSWORD` — from https://myaccount.google.com/apppasswords (sends sign-up notifications)
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com (AI expense categorization fallback)

Both are optional — the app works without them, those features just silently no-op.

## 5. Deploy the app

From your **local machine**, build the frontend and copy files:
```bash
# Build frontend
cd frontend
npm run build
cd ..

# Copy everything to the server (replace <IP> with your server IP)
rsync -avz --exclude='__pycache__' --exclude='*.pyc' --exclude='node_modules' \
    backend/ root@<IP>:/opt/analyzemyexpenses/backend/

rsync -avz frontend/dist/ root@<IP>:/opt/analyzemyexpenses/frontend/dist/

# Copy deploy config
rsync -avz deploy/ root@<IP>:/opt/analyzemyexpenses/deploy/

# Copy your encryption key and database (SENSITIVE — do this carefully)
scp backend/app/.db_encryption_key root@<IP>:/opt/analyzemyexpenses/backend/app/
scp backend/app/storage/expenses.db root@<IP>:/opt/analyzemyexpenses/backend/app/storage/
scp backend/app/storage/confirmed_income.enc root@<IP>:/opt/analyzemyexpenses/backend/app/storage/
```

## 6. Set up Python environment on the server

```bash
ssh root@<IP>
cd /opt/analyzemyexpenses/backend
python3 -m venv /opt/analyzemyexpenses/venv
/opt/analyzemyexpenses/venv/bin/pip install -r requirements.txt
chown -R www-data:www-data /opt/analyzemyexpenses
```

## 7. Configure nginx

```bash
cp /opt/analyzemyexpenses/deploy/nginx.conf /etc/nginx/sites-available/analyzemyexpenses
ln -s /etc/nginx/sites-available/analyzemyexpenses /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

## 8. Get HTTPS certificate

```bash
certbot --nginx -d analyzemyexpenses.net -d www.analyzemyexpenses.net
```

Follow the prompts — Certbot will auto-configure nginx and set up auto-renewal.

## 9. Start the backend service

```bash
cp /opt/analyzemyexpenses/deploy/analyzemyexpenses.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable analyzemyexpenses
systemctl start analyzemyexpenses
systemctl status analyzemyexpenses
```

## 10. Verify

- https://analyzemyexpenses.net — should load the app
- https://www.analyzemyexpenses.net — should redirect to apex
- http://analyzemyexpenses.net — should redirect to https

## Updating the app

```bash
# Rebuild frontend locally
cd frontend && npm run build && cd ..

# Redeploy
rsync -avz --exclude='__pycache__' --exclude='*.pyc' \
    backend/ root@<IP>:/opt/analyzemyexpenses/backend/
rsync -avz frontend/dist/ root@<IP>:/opt/analyzemyexpenses/frontend/dist/

# Restart backend
ssh root@<IP> "systemctl restart analyzemyexpenses"
```

## Storage paths on server

- App root: `/opt/analyzemyexpenses/`
- Backend: `/opt/analyzemyexpenses/backend/`
- Frontend static files: `/opt/analyzemyexpenses/frontend/dist/`
- Database: `/opt/analyzemyexpenses/backend/app/storage/expenses.db`
- Encryption key: `/opt/analyzemyexpenses/backend/app/.db_encryption_key`
- Python venv: `/opt/analyzemyexpenses/venv/`
- Env file: `/etc/analyzemyexpenses.env`
- Logs: `journalctl -u analyzemyexpenses -f`
