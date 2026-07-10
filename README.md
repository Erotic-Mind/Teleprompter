# Prompter

A calm, distraction-free teleprompter for the **Elgato Prompter** (or any external screen).
Runs on **Windows and Mac**. No internet, no account — your scripts stay on your machine.

## The idea

- Your **laptop** is the operator desk: write the script, then drive everything.
- The **prompter screen** shows big scrolling text, **mirrored** for the glass.
- Built for **retakes**: jump to any paragraph or line instantly, roll, jump back.

## Run it

**Easiest:** double-click **`Start Prompter.cmd`**. It makes the prompter its own
screen and launches the app.

**From a terminal:** `npm install` (first time), then `npm start`.

## Using it

1. **Edit** tab — paste your script. Leave a **blank line between paragraphs**.
2. Press **Show Prompter** if it isn't already on the glass.
   - If the status bar says *"mirroring your laptop"*, click **Make Separate Screen**.
3. **Perform** tab — your script becomes a list of paragraphs (or lines).
4. **Play** to roll. The current line **highlights live** here on the laptop, so you
   never have to look away to know where you are.

### Retakes (the important part)

- **Click any paragraph/line** → the prompter jumps there and waits.
- **⏮ / ⏭** (or **PageUp / PageDown**) → step back/forward one paragraph or line.
- Switch **Jump by: Paragraph / Line** depending on how fine you want the steps.
- Hit **Play** and you're rolling from that exact spot.

## Keyboard (while the control window is active)

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| PageUp / PageDown | Previous / Next paragraph (or line) |
| ↑ / ↓ | Speed up / down |
| Home | Back to top |

## Controls

- **Speed** — words per minute. **Font** — text size on the prompter.
- **Mirror** — flips text for the beam-splitter glass (keep **ON** for the Elgato).
- **Screen** picker — choose which display is the prompter.
- **Show / Hide Prompter** — bring the text screen up or dismiss it.

## Notes

- The Elgato is a USB display that slips back to *mirroring* your laptop when it
  sleeps. The launcher and the **Make Separate Screen** button re-extend it in one click.
- On **Mac** you need Elgato/DisplayLink's helper app so macOS can drive the USB display,
  then arrange displays as **Extend**.
- Your script and settings are **saved automatically** and reload next time.
