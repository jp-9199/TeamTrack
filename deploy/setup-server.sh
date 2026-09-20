#!/usr/bin/env bash
# ==============================================================================
# TeamTrack Enterprise Live Server One-Click Provisioning Script
# Target OS: Ubuntu 22.04 LTS / 24.04 LTS / Debian 12
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "   🚀 TeamTrack Production Cloud Server Provisioning"
echo "=========================================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Error: Please run this setup script as root or with sudo."
  exit 1
fi

echo "📦 1. Updating System Packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl wget git ufw htop ca-certificates gnupg lsb-release

echo "🔒 2. Configuring Firewall (UFW)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow 80/tcp    comment 'HTTP (Certbot/Caddy)'
ufw allow 443/tcp   comment 'HTTPS (Secure Web & WebSockets)'
ufw allow 3478/udp  comment 'STUN/TURN for WebRTC calling'
ufw --force enable

echo "🐳 3. Installing Docker & Docker Compose..."
if ! command -v docker &> /dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker installed successfully."
else
  echo "✅ Docker is already installed."
fi

echo "⚡ 4. Optimizing Linux Kernel for Real-time WebSockets..."
cat << 'EOF' > /etc/sysctl.d/99-teamtrack.conf
# Increase max open files and socket connections for thousands of concurrent WebRTC & WebSockets
fs.file-max = 2097152
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
EOF
sysctl --system > /dev/null

echo "📂 5. Setting up /opt/teamtrack directory..."
mkdir -p /opt/teamtrack
chmod 755 /opt/teamtrack

echo "=========================================================="
echo "✅ Server Provisioning Finished!"
echo "Next Steps:"
echo " 1. Clone your Git repository to /opt/teamtrack"
echo "    git clone <YOUR_REPO_URL> /opt/teamtrack"
echo " 2. Copy and configure .env.production:"
echo "    cp /opt/teamtrack/.env.production.example /opt/teamtrack/.env"
echo "    nano /opt/teamtrack/.env"
echo " 3. Launch live system:"
echo "    cd /opt/teamtrack && ./deploy/update.sh"
echo "=========================================================="
