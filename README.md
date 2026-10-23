# 2048

A free, no-sign-up 2048 you can play in the browser on phone or desktop.

**Play:** https://2048-classic-game.netlify.app

## Features

- Smooth slide, merge and spawn animations
- Arrow keys / WASD on desktop, swipe on mobile
- 3×3, 4×4, 5×5 and 6×6 boards, each with its own best score
- Auto-save: refresh or close the tab and pick up where you left off
- 3 undos per game (`U` or `Ctrl+Z`)
- Win and game-over screens, with "keep going" past 2048
- Merge sounds (toggleable), haptics on Android
- Stats: games played, wins, highest tile, total merges
- Share your score (native share sheet or clipboard)
- Installable and playable offline (PWA)
- Dark and light themes that follow the system setting

## Run locally

It's plain HTML/CSS/JS with no build step. Open `2048 Game/index.html` directly, or serve the folder:

```sh
npx serve "2048 Game"
```

## Deploy

The site is the `2048 Game/` folder, deployed as a static site on Netlify.
When you ship changes, bump `CACHE` in `2048 Game/sw.js` so returning players get the new version.

---

Made by [Peter Kiarie](https://peterkiarie.com/)
