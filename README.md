# local-netatmo

Read a HomeKit-compatible Netatmo Weather Station over your LAN and expose its measurements through a Hono HTTP service on Node.js. No Netatmo cloud API credentials or Apple account credentials are used by this adapter. The station still needs its normal initial setup.

**Status: local pairing and live Hono API readings verified with a Netatmo Weather Station and four accessories.** Saved credentials also work after a service restart. Server deployment and comparison against the Netatmo app remain to be validated. See [validation](docs/validation.md).

## What is available

| Measurement | HomeKit support |
| --- | --- |
| Temperature, humidity | Indoor, outdoor and compatible additional modules |
| CO₂ concentration, CO₂ detected, air quality | Indoor and compatible additional indoor modules |
| Battery, low battery | Verified on outdoor module, rain gauge and anemometer |
| Pressure, noise, rain, wind | Not exposed by Netatmo HomeKit |

Only characteristics reported by the station are returned; absent modules or metrics are not synthesized. Netatmo documents [supported measurements](https://helpcenter.netatmo.com/hc/en-us/articles/360010067180-What-can-you-do-with-a-Station-paired-with-Apple-HomeKit) and [HomeKit activation](https://helpcenter.netatmo.com/hc/en-us/articles/360010066080-How-do-I-activate-Apple-HomeKit-on-my-Weather-Station). Check compatibility in the Weather app; older station hardware may not support HomeKit.

## First run

Use Node.js 24 or newer, npm, and a machine on the station's LAN. Discovery uses UDP 5353: with a configured IPv4 address it queries the station directly first, then falls back to multicast DNS. Reserve the station's IP in DHCP.

```sh
npm ci
cp .env.example .env
```

Edit `.env` and set `NETATMO_HOST` to your station's IP. The HomeKit port is discovered; it is not necessarily 80 or 443.

```sh
npm run discover
```

Discovery first tries a direct query to `NETATMO_HOST` for up to three seconds. If that returns nothing, it browses multicast DNS for approximately eight seconds. It prints matching devices with their HomeKit identifier, TCP port and `availableToPair` flag. `[]` means no matching advertisement was received. Temporarily remove `NETATMO_HOST` to list all HomeKit devices. Discovery is read-only and does not pair or reset anything.

### Prepare the station for the adapter

For a station currently paired with Apple Home:

1. **Remove the station from its current home in the Apple Home app.**
2. **Reset the device following the [official Netatmo HomeKit reset procedure](https://helpcenter.netatmo.com/hc/en-us/articles/360010066720-How-do-I-reset-the-Station-Apple-HomeKit-procedure).** Reconnect its Wi-Fi afterward using the Netatmo Weather app's [network configuration instructions](https://helpcenter.netatmo.com/hc/en-us/articles/360021158611-I-have-changed-Wi-Fi-access-point-or-I-have-moved-How-do-I-reconfigure-my-connection).
3. **Use the HomeKit setup code printed on the back of the device.** Enter the eight-digit code as `XXX-XX-XXX` when running `npm run pair` below. Do not scan it into Apple Home or complete Apple Home pairing again; the station must remain available for this adapter.

The reset clears Wi-Fi settings and HomeKit pairing. Netatmo states that historical readings linked to your account are preserved. Older stations without a printed code require Netatmo's [code recovery/activation procedure](https://helpcenter.netatmo.com/hc/en-us/articles/360010155199-I-ve-lost-the-Apple-HomeKit-pairing-code-what-do-I-do).

Keep the code private. The CLI prompts without echoing it and never saves it. Do not pass it as a command argument or commit it.

An already paired accessory normally does not accept another initial `pair-setup` just because you know its setup code. This adapter does not import Apple Home credentials or bridge the station back into Apple Home. Removing it affects its availability in Apple Home and related automations.

### Pair and read

Once the station advertises `availableToPair: true`:

```sh
npm run pair
# Enter the code locally as XXX-XX-XXX.
npm start
```

Pairing creates `data/pairing.json` with mode `0600`, then attempts a real sensor read. The containing directory is created with mode `0700`. Treat this file as a device credential. Back it up privately and keep it when moving the adapter to another host. The CLI refuses to overwrite an existing pairing. If the verification read fails after pairing, keep the saved credentials and investigate connectivity instead of pairing again.

```sh
curl http://127.0.0.1:3000/api/readings
curl http://127.0.0.1:3000/ready
```

The default service listens on loopback. See [API and configuration](docs/api.md) and [deployment](docs/deployment.md) for server integration.

## Development

```sh
npm ci
npm run check
npm audit --omit=optional --audit-level=high
```

The project uses the TCP/IP modules of [hap-controller](https://github.com/Apollon77/hap-controller-node) directly. `.npmrc` disables dependency lifecycle scripts and omits optional Bluetooth native dependencies, which this project does not need. Keep that configuration when installing; the full optional dependency tree can report unrelated Bluetooth dependency advisories.

Tests cover data mapping, caching, error responses, authentication, configuration, credential storage, and worker termination. Each station request uses a disposable worker process with a 15-second deadline. Pairing allows 90 seconds and is never automatically retried. The HTTP API is read-only; it has no pairing, reset, or characteristic-write routes.

## Publishing

This project is shared publicly for reuse. Live HomeKit access has been verified; remaining deployment and recovery checks are recorded in the validation guide. Do not publish `.env`, `data/`, station identifiers, setup codes or captured real accessory databases. Follow [the release checklist](docs/validation.md) before calling a release verified. CI runs tests and the IP-only dependency audit. `private: true` prevents accidental npm publishing and does not prevent publishing source on GitHub.
