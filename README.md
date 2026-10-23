# 2048 by NX Gaming

A free, no-sign-up 2048 you can play in the browser on phone or desktop.

**Play:** https://nesturex.com/nx-gaming/2048

## Features

- Smooth slide, merge and spawn animations
- Arrow keys / WASD on desktop, swipe on mobile
- 3×3, 4×4, 5×5 and 6×6 boards, each with its own best score
- Auto-save: refresh or close the tab and pick up where you left off
- 3 undos per game (`U` or `Ctrl+Z`)
- Win and game-over screens, with "keep going" past 2048
- Merge sounds (toggleable), haptics on Android
- Stats: games played, wins, highest tile, total merges
- Share a branded NX Gaming score card (image of your score + final board) via the phone share sheet, download, copy, WhatsApp, X or Facebook
- Branded link previews (`og.png`) when the URL is pasted into chats/socials
- Installable and playable offline (PWA)
- Dark and light themes that follow the system setting

## Run locally

It's plain HTML/CSS/JS with no build step. Open `2048 Game/index.html` directly, or serve the folder:

```sh
npx serve "2048 Game"
```

## Deploy

The live game is served from the Nesture-X website (Next.js on Vercel) at
**https://nesturex.com/nx-gaming/2048**.

1. Copy the game files into the website repo:

   ```sh
   cd "2048 Game"
   cp index.html main.js brand.js style.css sw.js manifest.webmanifest \
      icon.svg fav.png og.png logo_nx_gaming.webp \
      "../../../nesture-x-website/nesture-x-website/public/nx-gaming/2048/"
   ```

   (Don't copy `_redirects`; that file is only for Netlify.)
2. Bump `CACHE` in `sw.js` whenever you ship changes so returning players get the new version.
3. The website's `next.config.ts` rewrites `/nx-gaming/2048` to `public/nx-gaming/2048/index.html`
   and sends a `Service-Worker-Allowed` header so offline play works without a trailing slash.

The old Netlify site (`2048-classic-game.netlify.app`, publishing `2048 Game/`) now just
301-redirects everything to the URL above via `2048 Game/_redirects`, so old shared links keep working.

If `logo_nx_gaming.webp` changes, regenerate `brand.js` (the share card uses an inline copy of the logo):

```sh
node -e "const fs=require('fs'); const b=fs.readFileSync('2048 Game/logo_nx_gaming.webp').toString('base64'); fs.writeFileSync('2048 Game/brand.js', 'window.NX_LOGO = \"data:image/webp;base64,' + b + '\";')"
```

---

Made by [Peter Kiarie](https://nesturex.com/)
