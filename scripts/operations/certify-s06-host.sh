#!/usr/bin/env bash
set -Eeuo pipefail

HOST="${S06_HOSTNAME:-sitemapper.thradex.home.arpa}"
EXPECTED_IP="${S06_EXPECTED_IP:-192.168.10.1}"
PROJECT="${S06_COMPOSE_PROJECT:-appm-site-mapper}"
CADDY_UNIT="${S06_CADDY_SYSTEMD_UNIT:-caddy.service}"

fail() { echo "S06_CERTIFY_FAIL: $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

systemctl is-enabled --quiet docker.service || fail "Docker is not enabled at boot"
systemctl is-active --quiet docker.service || fail "Docker is not active"
pass "Docker boot contract"

systemctl is-enabled --quiet "$CADDY_UNIT" || fail "Caddy is not enabled at boot"
systemctl is-active --quiet "$CADDY_UNIT" || fail "Caddy is not active"
pass "Caddy boot contract"

systemctl is-enabled --quiet site-mapper-dns.service || fail "FIELD DNS is not enabled"
systemctl is-active --quiet site-mapper-dns.service || fail "FIELD DNS is not active"
pass "FIELD DNS boot contract"

systemctl is-enabled --quiet site-mapper-watchdog.timer || fail "watchdog timer is not enabled"
systemctl is-active --quiet site-mapper-watchdog.timer || fail "watchdog timer is not active"
pass "watchdog timer contract"

mapfile -t app_ids < <(docker ps -aq \
  --filter "label=com.docker.compose.project=$PROJECT" \
  --filter "label=com.docker.compose.service=site-mapper")
(("${#app_ids[@]}" == 1)) || fail "expected exactly one Site Mapper container"
policy="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "${app_ids[0]}")"
[[ "$policy" == "unless-stopped" ]] || fail "Site Mapper restart policy is $policy"
running="$(docker inspect -f '{{.State.Status}}' "${app_ids[0]}")"
[[ "$running" == "running" ]] || fail "Site Mapper container is $running"
pass "Site Mapper restart contract"

resolved="$(getent ahostsv4 "$HOST" | awk 'NR==1 {print $1}')"
[[ "$resolved" == "$EXPECTED_IP" ]] || fail "$HOST resolved to ${resolved:-nothing}, expected $EXPECTED_IP"
pass "private DNS resolution"

curl -fsS --max-time 10 "http://127.0.0.1:3000/api/health" >/dev/null ||
  fail "loopback application health failed"
pass "loopback application health"

curl -fsS --max-time 10 "https://$HOST/api/health" >/dev/null ||
  fail "trusted HTTPS health failed"
pass "trusted HTTPS health"

cert_dates="$(echo | openssl s_client -connect "$EXPECTED_IP:443" -servername "$HOST" 2>/dev/null |
  openssl x509 -noout -dates 2>/dev/null)" || fail "unable to inspect live certificate"
grep -q '^notAfter=' <<<"$cert_dates" || fail "live certificate has no expiry"
pass "live certificate presented"

echo "S06_HOST_CERTIFIED hostname=$HOST dns=$EXPECTED_IP restart=$policy"