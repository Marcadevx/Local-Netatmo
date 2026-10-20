# Validation and release checklist

## Current evidence

On 2026-10-20, development checks passed using a temporary Node.js 24 runtime:

- Eleven automated tests covering fixture normalization, HTTP behavior, caching, config, credential storage, subprocess timeout, and direct DNS discovery parsing, malformed packets and socket timeouts.
- Real HTTP smoke test: loopback server startup, health/status responses, unpaired 503 errors and graceful shutdown passed.
- Clean `npm ci` succeeded with the project configuration.
- IP-only dependency audit: zero known vulnerabilities with `npm audit --omit=optional`.
- CLI discovery executed without changing accessories and returned no matching devices from the development environment.

The owner reported resetting the station, reconnecting Wi-Fi and leaving it out of Apple Home. Direct unicast DNS discovery then confirmed a Weather Station advertising HomeKit on TCP port 5001 with pairing availability enabled. The direct-query fallback is now part of the CLI and has been verified against the station. Multicast-only discovery returned no matching devices in this environment.

The owner subsequently completed local CLI pairing and reported four accessories. Live tests through a real Hono HTTP server independently verified:

- Readings from the main Weather Station: temperature, humidity, CO₂ concentration and CO₂ detected status.
- Outdoor Module: temperature, humidity, battery level, low-battery status and charging-state enumeration.
- Rain Gauge and Anemometer: battery level, low-battery status and charging-state enumeration. No rain or wind measurements were returned by the normalized HomeKit API.
- All returned characteristics had HAP status 0 in the tested snapshots.
- `/api/status`, `/api/readings`, `/health` and `/ready` behaved correctly with a configured bearer token; requests without the token returned 401.
- Repeated requests reused the cached snapshot.
- After stopping and restarting the HTTP process, another live read succeeded using the saved pairing, without the setup code.
- Pairing credentials were stored with file permissions 0600, and both test HTTP processes shut down cleanly.

No private pairing keys, station identifiers or captured accessory databases are included in these docs. Actual values were inspected locally but have not yet been compared with the Netatmo app. Hardware/firmware versions were not recorded. A physical station outage/recovery test has not been performed. systemd and Docker examples are supplied but have not been deployed or built here.

## Before a hardware-verified release

1. On the station's LAN, run discovery and confirm model, IP, HomeKit port and pairing availability.
2. Remove the station from Apple Home, reset it following Netatmo's procedure, reconnect Wi-Fi, and pair locally using the code on the back of the device. Leave it out of Apple Home. Verify the CLI reports a successful sensor read and saves mode-0600 credentials.
3. Read `/api/readings`, compare temperature, humidity and CO₂ against the Netatmo app allowing for refresh delay, and confirm outdoor/additional module identities. Record available metrics without publishing private identifiers.
4. Restart the service and verify readings work using saved credentials without the setup code.
5. Disconnect or power off the station; after the cache expires, verify `/api/readings` and `/ready` report failure within the request deadline. Restore connectivity and verify recovery. `/health` should stay live.
6. Test on the intended server, verify credential ownership, persistence and API authentication. Test whichever deployment method is chosen.
7. Run `npm ci`, `npm run check`, and `npm audit --omit=optional --audit-level=high` from a clean checkout.
8. Review staged files and Git history for `.env`, keys, setup codes, station IP/identifiers, logs and real accessory dumps. Do not initialize publication by adding ignored private files.
9. Update this page and the README with hardware/firmware, tested modules, deployment results and known limitations, then publish the source to the intended GitHub repository.

Public bug reports should include Node version, deployment method, HTTP status/error code and a sanitized description. Do not attach pairing files or setup codes.
