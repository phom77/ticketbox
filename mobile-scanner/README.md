# Mobile scanner

Expo React Native application for STAFF. Native builds store ticket datasets and pending check-ins in SQLite; the browser variant uses an in-memory store and loses that state on reload.

## Run

Start the backend from the repository root with `docker compose up -d --build`, then:

```sh
cd mobile-scanner
npm ci
npm start
```

Open the scanner on Android. Expo Go can exercise the camera and manual entry. To test the torch on hardware, use an Android development build that includes the local ScannerHardware module. The module uses the Android Camera2 flash capability for the rear camera. Staff access is currently denied by the Check-in policy. Use the development fixture below for an isolated UI walkthrough.

Copy `.env.example` to `.env` to configure the API:

| Environment | `EXPO_PUBLIC_API_BASE_URL` |
| --- | --- |
| Browser | `http://localhost:18091/api` |
| Android emulator | `http://10.0.2.2:18091/api` |
| Physical device | `http://<computer-LAN-IP>:18091/api` |

For a physical device, bind the gateway to the LAN using `APP_BIND_ADDRESS=0.0.0.0` in the root `.env`, set `APP_PUBLIC_URL` to that address and recreate the gateway. Use a trusted local network. Public Expo variables are embedded in the client and must not contain credentials or tokens. Restart Expo after configuration changes.

## At the gate

1. Sign in, select an event, and confirm the gate in Tổng quan. Download the event's ticket data if you expect interruptions.
2. Use Quét vé to scan a QR or enter its contents manually. “Cho phép vào cổng” means Check-in confirmed admission. “Chờ xác nhận” means the device stored the attempt and staff must wait.
3. Open Lịch sử to review results or select “Đồng bộ ngay” after reconnecting. Accepted entries become confirmed. Sync conflicts and failures stay visible separately. Keep app data while there are pending entries.
4. Check-in on the venue LAN can confirm admission when the Internet is unavailable. Set `EXPO_PUBLIC_ADMISSION_API_BASE_URL` to the venue Check-in API, including `/api`, if it has its own address. The direct Compose binding uses `CHECKIN_BIND_ADDRESS` and `CHECKIN_PORT` (default 18093). Keep all scanners pointed at the same authority during the event.

## Development fixture and checks

The fixture lives in `scripts/e2e/`, outside the Expo app. It binds to loopback by default, uses synthetic staff, events and tickets, and does not call real services. Start it from the repository root.

```sh
node scripts/e2e/scanner-fixture.mjs
```

For the Android emulator, start Expo with `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8093/api` and leave the LAN override unset. On a physical device you can use USB port forwarding (`adb reverse tcp:8093 tcp:8093`) and `http://127.0.0.1:8093/api`. If Metro also uses the USB connection, forward its port the same way. Use `scanner@example.test` / `fixture-password`. Select “Đêm nhạc Sài Gòn”, enter a gate and download the ticket data. The codes below can be entered by hand or encoded as QR.

| Fixture code | Behavior |
| --- | --- |
| `TB-ACCEPTED` | First scan confirmed, subsequent scans rejected. |
| `TB-PENDING` | Scan connection fails. The downloaded dataset allows a pending entry that sync accepts. |
| `TB-CONFLICT` | Scan connection fails. The downloaded dataset allows a pending entry that sync marks as a conflict. |
| `TB-UNKNOWN` | Check-in rejects the code. |
| `TB-EXPIRED` / `TB-DENIED` | Scan responds with HTTP 401 / 403. |

Use `node scripts/e2e/scanner-fixture.mjs --deny-staff` to return 403 on every staff endpoint after fixture login. This exercises the current disabled-route response without changing Check-in security.

For Chromium, run the scanner web app with request interception and use the repo's Playwright installation.

```sh
npm ci --prefix scripts/e2e
npx --prefix scripts/e2e playwright install chromium
EXPO_PUBLIC_API_BASE_URL=http://localhost:8092/api npm --prefix mobile-scanner run web -- --port 8092
```

In a separate terminal, run:

```sh
node scripts/e2e/scanner-mobile.mjs
npm --prefix mobile-scanner run typecheck
```

To exercise the camera path in Chromium, set `TICKETBOX_SCANNER_CAMERA_VIDEO` to a Y4M video of a QR containing `TB-ACCEPTED`. The camera run checks that the decoder submits once and that opening the menu releases the preview. An optional `TICKETBOX_SCANNER_QR_DECODER` points to a local copy of the same jsQR script loaded by Expo Camera on web.

The browser uses in-memory storage. Verify camera permission, Android Back, TalkBack, large text, duplicate reads and SQLite persistence by reopening the app on Android. A fixture walkthrough verifies the app flow. Production acceptance requires the scoped staff work in the scanner roadmap.
