# Mobile scanner

Expo React Native application for STAFF. Native builds store ticket datasets and pending check-ins in SQLite; the browser variant uses an in-memory store and loses that state on reload.

## Run

Start the backend from the repository root with `docker compose up -d --build`, then:

```sh
cd mobile-scanner
npm ci
npm start
```

Use Expo Go on a supported device or an emulator. Sign in with `staff@ticketbox.com` / `password123`.

Copy `.env.example` to `.env` to configure the API:

| Environment | `EXPO_PUBLIC_API_BASE_URL` |
| --- | --- |
| Browser | `http://localhost:18091/api` |
| Android emulator | `http://10.0.2.2:18091/api` |
| Physical device | `http://<computer-LAN-IP>:18091/api` |

For a physical device, bind the gateway to the LAN using `APP_BIND_ADDRESS=0.0.0.0` in the root `.env`, set `APP_PUBLIC_URL` to that address and recreate the gateway. Use a trusted local network. Public Expo variables are embedded in the client and must not contain credentials or tokens. Restart Expo after configuration changes.

## Offline workflow

1. Sign in online, select a concert and download its valid-ticket dataset.
2. Select the gate and scan QR codes. Offline matches create PENDING local logs; duplicate scans on the same device are rejected.
3. Reconnect to upload pending logs. Accepted entries become SYNCED; already-used tickets become CONFLICT; invalid entries become FAILED.
4. Review local/server history. Refresh the dataset online before a new shift.

Online scans atomically consume tickets in Core. Separate offline devices can both admit a ticket before synchronization; conflicts are resolved on the server after sync. Do not remove app data while unsynced logs remain.

Run `npm run typecheck` for static verification. Camera behavior and multi-device offline operation require device testing.
