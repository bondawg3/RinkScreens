# Installing RinkScreens on the rink PC

This is a one-time setup on the PC that will run RinkScreens (a back-office
computer, not one of the TVs). It takes about 10 minutes.

## 1. Install Node.js (one-time, if not already installed)

RinkScreens runs on [Node.js](https://nodejs.org). If this PC doesn't already
have it:

1. Go to https://nodejs.org and download the **LTS** version for Windows.
2. Run the installer, accepting the defaults.
3. Restart the PC after installing (this makes sure `node` is on the PATH).

To check if it's already installed, open Command Prompt and type `node -v` —
if you see a version number, you're set.

## 2. Unzip RinkScreens

Unzip this package to a permanent location, e.g. `C:\RinkScreens`. Don't run
it from inside the Downloads folder or a temporary location — pick somewhere
it can live long-term, since it stores its data (screens, displays, calendars,
uploaded images) in a `data` folder right next to it.

## 3. Start it

Double-click **start-rinkscreens.bat**. A window will open and stay open —
leave it running. It will print:

```
Admin panel:  http://localhost:3001/admin
```

## 4. Open the admin panel

On the same PC, open a browser to **http://localhost:3001/admin**. This
package ships pre-loaded with the current rink's data (screens, displays,
calendars, uploaded images, and the existing admin password) rather than a
blank first run — log in with the existing admin password. If you need a
fresh, empty setup instead, stop the server, delete `data\db.json`, and
restart; the first visit will then ask you to create a new admin password.

From any other computer or phone on the same Wi-Fi/network, use this PC's
network IP address instead of `localhost`, e.g. `http://192.168.1.50:3001/admin`.
To find this PC's IP address, open Command Prompt and run `ipconfig` — look
for "IPv4 Address."

## 5. Allow it through the Windows Firewall (needed for TVs to connect)

The TVs and any other devices need to reach this PC over the network. The
first time RinkScreens starts, Windows may show a firewall prompt — click
**Allow access** for both Private and Public networks. If you don't see a
prompt (or accidentally blocked it), add an inbound rule for **port 3001** in
Windows Defender Firewall settings.

## 6. Point each TV at its display

In the admin panel's **Displays** tab, add each physical TV (name + IP, so you
can keep track of which is which), then note its **display id** shown there.
On each TV's built-in browser, navigate to:

```
http://[this PC's IP]:3001/tv/[displayId]
```

For example, `http://192.168.1.50:3001/tv/1`. Set each TV's browser to open
this address automatically on startup if it supports that (most smart TV
browsers have a "homepage" or "kiosk" setting).

## 7. (Optional) Automatic updates

The admin panel's **Settings > Updates** tab can check GitHub for new
versions of RinkScreens and install them automatically, so you don't need
to repeat this packaging/unzip process for every update. Nothing needs to
be configured to turn this on — go to **Settings > Updates** and choose a
check schedule (interval or a specific time of day), and optionally turn
on automatic installs.

RinkScreens checks for updates automatically on the schedule you configure
(default every 24 hours). When a newer version is available,
the Updates tab shows an **Install Update** button — installing replaces
the app's code and restarts the server automatically, usually in under a
minute, and never touches the `data` or `uploads` folders (your screens,
displays, calendars, and images are never affected).

## 8. (Optional) Auto-start on reboot

If this PC restarts (power outage, Windows update, etc.), RinkScreens won't
come back up on its own unless you set that up. Double-click
**install-autostart.bat** once to make it launch automatically (hidden, no
window) whenever this PC logs in. To undo this later, run
**uninstall-autostart.bat**.

Until you set this up, just remember: after any reboot, double-click
**start-rinkscreens.bat** again.

---

## Troubleshooting

- **"node is not recognized..."** — Node.js isn't installed, or the PC needs a
  restart after installing it (step 1).
- **TVs can't connect / "site can't be reached"** — check the firewall step
  (step 5), and confirm the TV is using this PC's actual network IP, not
  `localhost`.
- **Firewall rule exists and `ping` works, but the TV/browser still times
  out** — this PC's Wi-Fi network may be categorized as **Public** instead of
  **Private**. Windows ships with a built-in Node.js *Block* rule for the
  Public profile, which silently overrides any custom *Allow* rule you add
  for port 3001 (Block always wins over Allow). To check and fix, open
  PowerShell as Administrator on this PC:
  ```powershell
  # Check the network category
  Get-NetConnectionProfile

  # Check for the built-in Node.js block rule
  Get-NetFirewallRule -DisplayName "Node.js JavaScript Runtime" | Select-Object DisplayName,Action,Profile,Enabled
  ```
  If a rule shows `Action: Block` and `Profile: Public`, disable it:
  ```powershell
  Get-NetFirewallRule -DisplayName "Node.js JavaScript Runtime" | Where-Object {$_.Action -eq "Block"} | Disable-NetFirewallRule
  ```
  Then confirm from another device on the network:
  ```powershell
  Test-NetConnection -ComputerName [this PC's IP] -Port 3001
  ```
  `TcpTestSucceeded : True` means it's fixed. (Reclassifying the network as
  Private instead — `Set-NetConnectionProfile -InterfaceAlias "Wi-Fi"
  -NetworkCategory Private` — is a more thorough fix but changes broader
  network trust settings, so only do this if you understand the tradeoff.)
- **Forgot the admin password** — there's currently no self-service reset;
  stop the server, delete `data\db.json`, and restart — this resets *all*
  settings and requires re-entering calendars, screens, etc., so use as a last
  resort. Ask your provider about a safer reset before doing this.
- **Something looks broken after unzipping a new version** — check
  `CHANGELOG.md` in this folder for anything marked BREAKING; a version that
  changes TV URLs, for instance, needs every TV's address updated too.
