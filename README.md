# Prompter

A calm, distraction-free teleprompter for the **Elgato Prompter** (or any external screen).
Runs on **Windows and macOS**. No internet, no account — your scripts stay on your machine.

It comes **two ways**, so you can pick the one that fits.

---

## Two ways to run it

### A. Simplest — one file, no install  (`b.html`)

**Double-click `b.html`.** That's the whole app: a single self-contained page that opens in
any browser and runs **completely offline** — no Node, no server, no account, nothing to
install. It has true **words-per-minute** speed (30–400 wpm), a premium control bar that
**fades away while you roll**, mirror / flip, text & background colours, a reading-line
guide, and fullscreen (**F11**). Drag the window onto the prompter and press **Space** to
play. Best for a single screen or **duplicate** mode.

> Tip: right-click `b.html` → **Open with → Chrome** for the smoothest scroll, or make a
> desktop shortcut to `chrome.exe --app="file:///…/b.html"` for a clean, tab-free app window.

### B. Full desktop app — control on the laptop, text on the prompter

The **Electron app** below turns your **laptop into the operator desk** — you write the
script and drive everything from there — while the **prompter screen** shows the big
scrolling text. Built for **retakes** (jump to any paragraph or line) and **Extend** mode.
It needs Node.js; setup is below.

---

## Install & run

You need **[Node.js](https://nodejs.org)** (the LTS version) installed first. Check with
`node --version` in a terminal.

### 🪟 Windows

**Easiest:** double-click **`Start Prompter.cmd`**. It turns the prompter into its own
screen and launches the app.

**From a terminal (PowerShell):**
```powershell
npm install   # first time only
npm start
```

### 🍎 macOS  (full setup)

macOS can't drive the Elgato's USB display on its own, so there's a one-time driver step.

**1. Install Node.js** — from [nodejs.org](https://nodejs.org), or with Homebrew:
```bash
brew install node
```

**2. Install the Elgato / DisplayLink driver** so macOS sees the prompter as a screen:
- Install **[Elgato Camera Hub](https://www.elgato.com/downloads)** (it bundles the DisplayLink driver), **or**
- Install **DisplayLink Manager** directly from Synaptics.
- Open the app once and, if macOS asks, grant it **Screen Recording** permission in
  **System Settings → Privacy & Security → Screen Recording** (DisplayLink needs this to
  draw to the display). Then restart the app.

**3. Set the prompter as a separate screen:**
- **System Settings → Displays** → click the prompter → set **"Use as: Extended display"**
  (not *Mirror*).

**4. Get the app and run it:**
```bash
git clone https://github.com/Erotic-Mind/Teleprompter.git
cd Teleprompter
npm install
npm start
```

**Mac notes:**
- The app **auto-detects** the prompter screen and shows the text there.
- The **"Make Separate Screen"** button is hidden on Mac (it's a Windows helper) — you use
  **System Settings → Displays → Extended** instead (step 3).
- If macOS pops a security prompt the first time you `npm start`, allow it.
- Apple Silicon (M1–M4) is fully supported — `npm install` fetches the right build.

---

## Using it

1. **Edit** tab — paste your script. Leave a **blank line between paragraphs**.
2. Make sure the status bar (top) is **green** ("Prompter live…"). If not:
   - **Windows:** click **Make Separate Screen**, then **Show Prompter**.
   - **Mac:** set the display to *Extended* (above), then **Show Prompter**.
3. **Perform** tab — your script becomes a list of paragraphs (or lines).
4. **Play** to roll. The current line **highlights live** on the laptop, so you never have
   to look away to know where you are.
5. **Preview** tab — a readable live copy of exactly what the prompter is showing.

### Retakes (the important part)

- **Click any paragraph/line** → the prompter jumps there and waits.
- **⏮ / ⏭** (or **PageUp / PageDown**) → step back/forward one paragraph or line.
- Switch **Jump by: Paragraph / Line** for coarse or fine steps.
- Hit **Play** and you're rolling from that exact spot.

## Keyboard (while the control window is active)

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| PageUp / PageDown | Previous / Next paragraph (or line) |
| ↑ / ↓ | Speed up / down |
| Home | Back to top |

## Controls

- **Speed** — words per minute (up to 500). **Font** — text size on the prompter.
- **Mirror** — flips the text left-to-right. **Off by default.** Turn it **ON only if your
  prompter glass shows the text backwards.**
- **Screen** picker — choose which display is the prompter.
- **Show / Hide Prompter** — bring the text screen up or dismiss it.

Every button and slider also shows a plain-English tip when you hover over it.

---

## Troubleshooting

- **"Prompter is mirroring your laptop"** — it's not a separate screen yet.
  Windows: click **Make Separate Screen**. Mac: set it to *Extended* in System Settings.
  (The Elgato is a USB display that slips back to mirroring when it sleeps — just redo this.)
- **Text reads backwards on the glass** — turn **Mirror** ON.
- **Prompter screen stays black** — click **Show Prompter**, and check the **Screen** picker
  is pointing at the Elgato.
- **Scrolling won't start** — make sure you have a script pasted, then press **Play** / Space.

## Good to know

- Everything runs **locally and offline** — no account, no cloud.
- Your **script and settings are saved automatically** and reload next time you open the app.
