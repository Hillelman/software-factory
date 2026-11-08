---
name: dashboard
description: Start (if needed) and open the software factory kanban dashboard in the browser, and print its local and LAN URLs.
argument-hint: "[stop]"
---

- If the argument is `stop`, run `factory dashboard stop` and relay the result.
- Otherwise run `factory dashboard start`, then `factory dashboard open`, and reply in two lines:
  - `Local: <localUrl>`
  - `Phone/LAN: <first lanUrl>` (or "no LAN interface found"). Tap the phone icon on the dashboard to get a QR code.

The URLs contain an access token. Treat them like a password and don't paste them anywhere public.
