#!/usr/bin/env bash
set -Eeuo pipefail

[[ "$(id -u)" -eq 0 ]] || { echo "TFARM_ERROR: bootstrap requires root" >&2; exit 1; }
[[ "$(uname -m)" == "x86_64" ]] || { echo "TFARM_ERROR: x86_64 required" >&2; exit 1; }
[[ -r /etc/os-release ]] || { echo "TFARM_ERROR: missing /etc/os-release" >&2; exit 1; }
. /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || {
  echo "TFARM_ERROR: Ubuntu 24.04 required (found ${ID:-unknown} ${VERSION_ID:-unknown})" >&2
  exit 1
}

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg git python3 gpg iproute2 network-manager kea-dhcp4-server dnsmasq-base snmp

install -m 0755 -d /etc/apt/keyrings
tmp_key="$(mktemp)"
trap 'rm -f "$tmp_key"' EXIT
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes --output "$tmp_key"
install -m 0644 "$tmp_key" /etc/apt/keyrings/docker.gpg
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu %s stable\n'   "$(dpkg --print-architecture)" "$VERSION_CODENAME"   > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

docker --version
docker compose version

if [[ "${TFARM_INSTALL_ONLY:-0}" == "1" ]]; then
  echo "TFARM_HOST_PACKAGES_INSTALLED"
  exit 0
fi

command -v systemctl >/dev/null || {
  echo "TFARM_ERROR: systemd/systemctl required for host activation" >&2
  exit 1
}
systemctl enable --now docker
docker version >/dev/null
echo "TFARM_HOST_BOOTSTRAP_OK"