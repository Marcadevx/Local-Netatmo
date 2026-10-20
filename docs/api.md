# API and configuration

All endpoints return JSON. Responses use `Cache-Control: no-store`. If `API_TOKEN` is configured, every endpoint requires `Authorization: Bearer <token>`, including health endpoints.

| Method and path | Behavior |
| --- | --- |
| `GET /health` | Process liveness only; does not contact the station |
| `GET /ready` | Performs or reuses a recent successful sensor read; 200 only if it succeeds |
| `GET /api/status` | Whether a structurally valid local pairing file exists; does not verify connectivity |
| `GET /api/readings` | Latest HomeKit snapshot, cached for 30 seconds by default |

Illustrative reading fragment, not a captured station response:

```json
{
  "readAt": "2026-10-20T12:00:00.000Z",
  "source": "homekit",
  "accessories": [{
    "id": 1,
    "name": "Indoor",
    "readings": [{
      "characteristic": "1.11",
      "serviceId": 10,
      "metric": "temperature",
      "unit": "°C",
      "value": 21.5,
      "status": 0
    }]
  }]
}
```

`readAt` is when the adapter read the station, **not** the time the physical measurement was taken. Cached responses retain their original time. HomeKit does not provide a reliable measurement timestamp for these values. Polling more often does not force the station to take a new measurement.

Readings remain grouped by HomeKit accessory ID. A station may organize several services within one accessory. Use `characteristic` (`aid.iid`), `serviceId`, and optional `serviceName` to distinguish values; do not assume the first accessory is indoors. IDs can change after a station reset or module changes.

Metric names: `temperature` (°C), `humidity` (%), `carbonDioxide` (ppm), `battery` (%), `batteryLow`, `carbonDioxideDetected`, `airQuality`, `chargingState`, and `statusFault`. Unitless values retain the HomeKit enumeration: air quality 0 unknown, 1 excellent, 2 good, 3 fair, 4 inferior, 5 poor; low battery and CO₂ detected use 0/1. Fault and charging state are raw HomeKit values. A failed characteristic has `value: null` and its HAP status. A successful snapshot can contain failed individual characteristics, so inspect their status before using values. A module absent from the accessory database is omitted. On the tested station, the rain gauge and anemometer appear as accessories with battery readings only; their presence does not imply rain or wind measurements are available.

Concurrent requests share a single station read. Expired cached data is never silently returned after a failed read. There is no background polling or historical storage.

| HTTP status | Meaning |
| --- | --- |
| 401 | Missing or invalid API token |
| 503 | Not paired or configured device differs from saved pairing |
| 502 | Station unavailable, read failed, or 15-second deadline exceeded |
| 500 | Local/internal failure, including malformed pairing storage |

Error bodies have `error` and optionally `message`. Protocol buffers, credentials and upstream error details are not exposed.

| Environment variable | Default / purpose |
| --- | --- |
| `NETATMO_HOST` | Station IP; recommended DHCP reservation |
| `HOST` | `127.0.0.1`, HTTP bind address |
| `PORT` | `3000` |
| `API_TOKEN` | Empty on loopback; at least 32 characters required on other binds |
| `PAIRING_FILE` | `./data/pairing.json`, relative to working directory |
| `CACHE_TTL_SECONDS` | `30`, integer 0–3600; 0 disables reuse after completion |
| `NETATMO_DEVICE_ID` | Optional HomeKit identifier override; requires `NETATMO_PORT` |
| `NETATMO_PORT` | Optional TCP port override; requires `NETATMO_DEVICE_ID` |

At runtime the saved endpoint is used, with host/port overrides from configuration. If the station changes its HomeKit port, discover it again and update both override fields. Runtime requests do not invoke discovery. For manual pairing with overrides, the standard non-MFi `PairSetup` method is used; use normal discovery for feature-aware pairing. Overrides do not bypass an existing pairing.

For LAN access set `HOST=0.0.0.0` and a random API token (`openssl rand -hex 32`). Plain HTTP does not encrypt the token: use a trusted LAN or TLS reverse proxy. Keep the service off the public Internet. No CORS policy permitting browser cross-origin access is installed.

Characteristic UUID mappings follow the [HAP-NodeJS definitions](https://github.com/homebridge/HAP-NodeJS/blob/latest/src/lib/definitions/CharacteristicDefinitions.ts).
