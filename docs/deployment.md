# Deploying on a local server

Install Node.js 24+, copy the source and lockfile, and run `npm ci`. The host must reach the station's HomeKit TCP port. Initial discovery uses UDP 5353, querying the configured IPv4 address directly before falling back to multicast DNS. Use the same LAN, avoid guest Wi-Fi isolation, and allow the query and response traffic. A DHCP reservation helps avoid endpoint changes.

First [prepare the station](../README.md#prepare-the-station-for-the-adapter): remove it from Apple Home, reset it following Netatmo's procedure, reconnect Wi-Fi, and use the code on the back of the device for this adapter. Leave it out of Apple Home.

Pair on the server when possible:

```sh
cd /opt/local-netatmo
cp .env.example .env
# Edit NETATMO_HOST, then:
npm run discover
npm run pair
npm start
```

If pairing was performed on another host, privately transfer `.env` and `data/pairing.json`; preserve restrictive permissions and ownership for the service account. Stop the old instance before starting the new one. Do not delete an active pairing file: the station may continue to consider that controller paired. This project has no automatic unpair operation.

## systemd (Linux)

[The example unit](../deploy/local-netatmo.service) assumes source in `/opt/local-netatmo`, Node in `/usr/bin/node`, and a dedicated `local-netatmo` user and group. Adjust paths for your server. Give that account access to its private pairing directory and config; install dependencies before enabling the service. The unit runs the existing entry point with `.env` and restarts on failure.

```sh
sudo cp deploy/local-netatmo.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now local-netatmo
sudo systemctl status local-netatmo
journalctl -u local-netatmo
```

Keep `HOST=127.0.0.1` for a consumer on the same host. For other LAN consumers configure an API token and bind address as described in [API configuration](api.md).

## Containers (Linux host networking)

The Dockerfile provides an alternative to systemd. Build and run from the project root:

```sh
docker build -t local-netatmo .
mkdir -p data
# The image runs as UID 1000. Match directory ownership to your container user.
chmod 700 data
docker run --rm -it --network host --env-file .env \
  -v "$PWD/data:/app/data" local-netatmo node src/cli.js discover
docker run --rm -it --network host --env-file .env \
  -v "$PWD/data:/app/data" local-netatmo node src/cli.js pair
docker run -d --name local-netatmo --restart unless-stopped \
  --network host --env-file .env -v "$PWD/data:/app/data" local-netatmo
```

Host networking simplifies mDNS on Linux. These commands are not a portable Docker Desktop networking recipe. Pairing and normal operation must share the same persistent volume. Resolve bind-mount ownership before pairing; do not make credentials world-readable. With loopback binding and host networking the API is accessible from the host.

## Troubleshooting

- Empty discovery: check the configured IP, same-LAN connectivity, firewall, UDP 5353 replies and station HomeKit activation. Direct IPv4 discovery can work even when multicast forwarding is unavailable. Scan advertisements on the actual server rather than guessing a TCP port. Discovering nothing does not prove the station lacks HomeKit.
- Already paired: follow the station preparation steps in the README before changing Apple Home. Knowing the code alone does not grant access to an existing home.
- Incorrect code: recover the original code. Avoid repeated guesses; HomeKit can back off or lock out attempts.
- 502 errors: check power, IP, HomeKit port and whether the station's pairing was reset. Reuse saved keys if valid. Discover after firmware changes or reconnects.
- Pairing saved but verification failed: retain the file. Run the HTTP service and retry reading once connectivity is restored.
- Credential transfer: the service account must be able to read the file. Never paste it into a public issue.

The API is an adapter, not a historical database. Your consuming server can poll `/api/readings`, inspect `readAt` and characteristic statuses, and store observations if needed.
