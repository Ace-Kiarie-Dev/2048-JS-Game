(() => {
    "use strict";

    const SIZES = [3, 4, 5, 6];
    const WIN_VALUE = 2048;
    const MAX_UNDO = 3;
    const SLIDE_MS = 110; // keep in sync with --slide in style.css
    const STORE_KEY = "nx-2048:v1";

    // Matched against both e.code (physical key) and e.key (what the key produces),
    // so numpad arrows, Fn-arrow combos and older browsers ("Left") all work.
    const KEYS = {
        ArrowLeft: "left", Left: "left", KeyA: "left", Numpad4: "left",
        ArrowRight: "right", Right: "right", KeyD: "right", Numpad6: "right",
        ArrowUp: "up", Up: "up", KeyW: "up", Numpad8: "up",
        ArrowDown: "down", Down: "down", KeyS: "down", Numpad2: "down",
    };

    const $ = (id) => document.getElementById(id);
    const ui = {
        score: $("score"), scoreBox: $("score-box"), best: $("best"),
        sizes: $("sizes"), undo: $("undo"), undoCount: $("undo-count"), newGame: $("new-game"),
        board: $("board"), grid: $("grid"), tiles: $("tiles"),
        overlay: $("overlay"), overlayKicker: $("overlay-kicker"), overlayTitle: $("overlay-title"),
        overlayText: $("overlay-text"), overlayActions: $("overlay-actions"),
        sound: $("sound"), statsBtn: $("stats-btn"), shareBtn: $("share-btn"),
        stats: $("stats"), statPlayed: $("stat-played"), statWon: $("stat-won"),
        statTile: $("stat-tile"), statMerges: $("stat-merges"), statBests: $("stat-bests"),
        share: $("share"), sharePreview: $("share-preview"), shareImg: $("share-img"),
        shareNative: $("share-native"), shareDownload: $("share-download"), shareCopy: $("share-copy"),
        shareWa: $("share-wa"), shareX: $("share-x"), shareFb: $("share-fb"), shareLink: $("share-link"),
        shareStatus: $("share-status"), year: $("year"),
    };

    // ---------- storage ----------

    function loadStore() {
        try {
            return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
        } catch {
            return {};
        }
    }

    const saved = loadStore();
    const prefs = { size: 4, sound: true, ...saved.prefs };
    if (!SIZES.includes(prefs.size)) prefs.size = 4;
    const stats = { played: 0, won: 0, bestTile: 0, merges: 0, ...saved.stats };
    const best = { ...saved.best };     // best score per board size
    const games = { ...saved.games };   // in-progress game per board size

    function persist() {
        games[state.size] = {
            cells: toCells(state.grid),
            score: state.score,
            won: state.won,
            keepPlaying: state.keepPlaying,
            over: state.over,
            undosLeft: state.undosLeft,
            history: state.history,
        };
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({ prefs, stats, best, games }));
        } catch {
            // private mode or storage full: the game still works, it just won't resume
        }
    }

    // ---------- board model ----------
    // The grid holds tile objects ({ id, value, r, c }) so each tile keeps its own
    // DOM node across moves, which is what lets it slide instead of jump.

    let state = null;
    let nextId = 1;
    const nodes = new Map(); // tile id -> element

    const emptyGrid = (n) => Array.from({ length: n }, () => Array(n).fill(null));
    const toCells = (grid) => grid.map((row) => row.map((t) => (t ? t.value : 0)));
    const fromCells = (cells) =>
        cells.map((row, r) => row.map((v, c) => (v ? { id: nextId++, value: v, r, c } : null)));
    const eachTile = (grid, fn) => grid.forEach((row) => row.forEach((t) => t && fn(t)));

    function isValidCells(cells, n) {
        return Array.isArray(cells) && cells.length === n &&
            cells.every((row) => Array.isArray(row) && row.length === n && row.every(Number.isInteger));
    }

    function maxTile() {
        let max = 0;
        eachTile(state.grid, (t) => { max = Math.max(max, t.value); });
        return max;
    }

    function spawn() {
        const empty = [];
        state.grid.forEach((row, r) => row.forEach((t, c) => { if (!t) empty.push([r, c]); }));
        if (!empty.length) return;
        const [r, c] = empty[Math.floor(Math.random() * empty.length)];
        state.grid[r][c] = { id: nextId++, value: Math.random() < 0.9 ? 2 : 4, r, c, isNew: true };
    }

    function canMove() {
        const g = state.grid;
        const n = state.size;
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const t = g[r][c];
                if (!t) return true;
                if (c + 1 < n && g[r][c + 1]?.value === t.value) return true;
                if (r + 1 < n && g[r + 1][c]?.value === t.value) return true;
            }
        }
        return false;
    }

    // Each line is a list of [r, c] ordered from the edge the tiles slide towards.
    function lines(dir, n) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const line = [];
            for (let j = 0; j < n; j++) {
                const k = dir === "right" || dir === "down" ? n - 1 - j : j;
                line.push(dir === "left" || dir === "right" ? [i, k] : [k, i]);
            }
            out.push(line);
        }
        return out;
    }

    const canPlay = () => !state.over && !(state.won && !state.keepPlaying);

    function move(dir) {
        if (!canPlay()) return;

        const snapshot = { cells: toCells(state.grid), score: state.score };
        const grid = emptyGrid(state.size);
        const removed = [];
        let merged = 0;
        let topMerge = 0;
        let gained = 0;
        let moved = false;

        for (const line of lines(dir, state.size)) {
            let slot = 0;
            let last = null; // last placed tile in this line that can still merge
            for (const [r, c] of line) {
                const t = state.grid[r][c];
                if (!t) continue;
                if (last && last.value === t.value) {
                    const [tr, tc] = line[slot - 1];
                    const value = t.value * 2;
                    grid[tr][tc] = { id: nextId++, value, r: tr, c: tc, merged: true };
                    t.r = tr;
                    t.c = tc;
                    removed.push(t, last);
                    merged++;
                    gained += value;
                    topMerge = Math.max(topMerge, value);
                    moved = true;
                    last = null;
                } else {
                    const [tr, tc] = line[slot++];
                    if (tr !== r || tc !== c) moved = true;
                    t.r = tr;
                    t.c = tc;
                    grid[tr][tc] = t;
                    last = t;
                }
            }
        }

        if (!moved) {
            nudge(dir);
            return;
        }

        state.history.push(snapshot);
        if (state.history.length > MAX_UNDO) state.history.shift();
        state.grid = grid;
        state.score += gained;
        spawn();
        render(removed);

        if (merged) {
            stats.merges += merged;
            stats.bestTile = Math.max(stats.bestTile, topMerge);
            popScore(gained);
            blip(topMerge);
            buzz();
        }
        if (state.score > (best[state.size] || 0)) best[state.size] = state.score;

        if (!state.won && topMerge >= WIN_VALUE) {
            state.won = true;
            stats.won++;
            later(() => { chime(); showOverlay("win"); });
        } else if (!canMove()) {
            state.over = true;
            later(() => { thud(); showOverlay("over"); });
        }

        sync();
    }

    function startGame(size) {
        state = {
            size,
            grid: emptyGrid(size),
            score: 0,
            won: false,
            keepPlaying: false,
            over: false,
            undosLeft: MAX_UNDO,
            history: [],
        };
        spawn();
        spawn();
        stats.played++;
        mount();
        sync();
    }

    function resumeGame(size) {
        const g = games[size];
        if (!g || !isValidCells(g.cells, size) || !g.cells.some((row) => row.some(Boolean))) {
            startGame(size);
            return;
        }
        state = {
            size,
            grid: fromCells(g.cells),
            score: g.score | 0,
            won: !!g.won,
            keepPlaying: !!g.keepPlaying,
            over: !!g.over,
            undosLeft: Math.min(MAX_UNDO, Math.max(0, g.undosLeft | 0)),
            history: (Array.isArray(g.history) ? g.history : [])
                .filter((h) => h && isValidCells(h.cells, size))
                .slice(-MAX_UNDO),
        };
        if (!canMove()) state.over = true;
        best[size] = Math.max(best[size] || 0, state.score);
        mount();
        if (state.over) showOverlay("over");
        else if (state.won && !state.keepPlaying) showOverlay("win");
        sync();
    }

    function undo() {
        if (!state.history.length || state.undosLeft <= 0) return;
        const snap = state.history.pop();
        state.undosLeft--;
        state.grid = fromCells(snap.cells);
        state.score = snap.score;
        state.over = false;
        if (state.won) state.keepPlaying = true;
        hideOverlay();
        clearTiles();
        render();
        sync();
    }

    function keepGoing() {
        state.keepPlaying = true;
        hideOverlay();
        if (!canMove()) {
            state.over = true;
            showOverlay("over");
        }
        sync();
    }

    // ---------- rendering ----------

    function mount() {
        ui.board.style.setProperty("--n", state.size);
        ui.grid.replaceChildren(
            ...Array.from({ length: state.size * state.size }, () => {
                const cell = document.createElement("div");
                cell.className = "cell";
                return cell;
            })
        );
        hideOverlay();
        clearTiles();
        render();
    }

    function clearTiles() {
        ui.tiles.replaceChildren();
        nodes.clear();
    }

    function place(node, t) {
        node.style.setProperty("--r", t.r);
        node.style.setProperty("--c", t.c);
    }

    function render(removed = []) {
        eachTile(state.grid, (t) => {
            let node = nodes.get(t.id);
            if (!node) {
                node = document.createElement("div");
                node.className = "tile" + (t.isNew ? " tile-new" : "") + (t.merged ? " tile-merged" : "");
                node.dataset.v = Math.min(t.value, 8192);
                node.dataset.len = String(t.value).length;
                const inner = document.createElement("div");
                inner.className = "tile-inner";
                inner.textContent = t.value;
                node.append(inner);
                place(node, t);
                ui.tiles.append(node);
                nodes.set(t.id, node);
            } else {
                place(node, t);
            }
        });

        // Tiles that were merged away slide into their partner, then disappear
        for (const t of removed) {
            const node = nodes.get(t.id);
            if (!node) continue;
            nodes.delete(t.id);
            place(node, t);
            node.classList.add("tile-gone");
            setTimeout(() => node.remove(), SLIDE_MS + 30);
        }
    }

    function sync() {
        ui.score.textContent = state.score.toLocaleString();
        ui.best.textContent = (best[state.size] || 0).toLocaleString();
        ui.undoCount.textContent = state.undosLeft;
        ui.undo.disabled = !state.history.length || state.undosLeft <= 0;
        for (const b of ui.sizes.querySelectorAll("[data-size]")) {
            b.setAttribute("aria-checked", String(+b.dataset.size === state.size));
        }
        ui.sound.setAttribute("aria-pressed", String(prefs.sound));
        persist();
    }

    function showOverlay(kind) {
        const score = state.score.toLocaleString();
        const actions = [];
        if (kind === "win") {
            ui.overlayKicker.textContent = "You did it";
            ui.overlayTitle.textContent = "2048!";
            ui.overlayText.textContent = `Score ${score}. Want to go for 4096?`;
            actions.push(["Keep going", keepGoing, true], ["New game", () => startGame(state.size)], ["Share score", openShare]);
        } else {
            const isBest = state.score > 0 && state.score >= (best[state.size] || 0);
            ui.overlayKicker.textContent = "No moves left";
            ui.overlayTitle.textContent = "Game over";
            ui.overlayText.textContent =
                `You scored ${score}${isBest ? " — your best yet" : ""}. Highest tile: ${maxTile()}.`;
            actions.push(["Try again", () => startGame(state.size), true]);
            if (state.history.length && state.undosLeft > 0) actions.push([`Undo (${state.undosLeft})`, undo]);
            actions.push(["Share score", openShare]);
        }
        ui.overlayActions.replaceChildren(
            ...actions.map(([label, fn, primary]) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = primary ? "btn btn-accent" : "btn";
                b.textContent = label;
                b.addEventListener("click", fn);
                return b;
            })
        );
        ui.overlay.hidden = false;
        ui.overlayActions.querySelector("button")?.focus({ preventScroll: true });
    }

    function hideOverlay() {
        ui.overlay.hidden = true;
    }

    function popScore(amount) {
        const s = document.createElement("span");
        s.className = "score-add";
        s.textContent = "+" + amount;
        ui.scoreBox.append(s);
        setTimeout(() => s.remove(), 700);
    }

    function nudge(dir) {
        ui.board.classList.remove("nudge-left", "nudge-right", "nudge-up", "nudge-down");
        void ui.board.offsetWidth; // restart the animation
        ui.board.classList.add("nudge-" + dir);
    }

    const later = (fn) => setTimeout(fn, SLIDE_MS + 220);
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // ---------- sound & haptics ----------

    let audio = null;
    function tone(freq, at = 0, dur = 0.16, vol = 0.06) {
        if (!prefs.sound) return;
        try {
            audio = audio || new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === "suspended") audio.resume();
            const t0 = audio.currentTime + at;
            const osc = audio.createOscillator();
            const gain = audio.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, t0);
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            osc.connect(gain).connect(audio.destination);
            osc.start(t0);
            osc.stop(t0 + dur + 0.02);
        } catch {
            // no Web Audio: play silently
        }
    }

    // Bigger merges ring higher
    const blip = (value) => tone(180 * 2 ** (Math.log2(value) / 4));
    const chime = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3));
    const thud = () => [330, 262, 196].forEach((f, i) => tone(f, i * 0.12, 0.3));
    const buzz = () => { if (navigator.vibrate) navigator.vibrate(8); };

    // ---------- share card ----------
    // A 1080×1080 PNG with the NX Gaming logo, score and final board, drawn on a canvas
    // so it can be shared to chats/socials or downloaded.

    const CARD = 1080;
    const DISPLAY = 'Unbounded, "Arial Black", sans-serif';
    const UI_FONT = '"Space Grotesk", system-ui, sans-serif';
    const CANONICAL = "https://nesturex.com/nx-gaming/2048";

    const logo = new Image();
    logo.src = window.NX_LOGO || "logo_nx_gaming.webp"; // inline copy keeps the canvas exportable

    // Read tile colours from the stylesheet so the card always matches the board
    const tileColorCache = {};
    function tileColors(value) {
        const v = Math.min(value, 8192);
        if (!tileColorCache[v]) {
            const probe = document.createElement("div");
            probe.className = "tile";
            probe.dataset.v = v;
            probe.hidden = true;
            document.body.append(probe);
            const cs = getComputedStyle(probe);
            tileColorCache[v] = { bg: cs.getPropertyValue("--t-bg").trim(), ink: cs.getPropertyValue("--t-ink").trim() };
            probe.remove();
        }
        return tileColorCache[v];
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function glow(ctx, x, y, radius, color) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, CARD, CARD);
    }

    // Shrink the font until the text fits maxWidth
    function fitFont(ctx, text, weight, family, size, maxWidth) {
        do {
            ctx.font = `${weight} ${size}px ${family}`;
            size -= 4;
        } while (ctx.measureText(text).width > maxWidth && size > 20);
    }

    function drawBoard(ctx, x, y, size) {
        const n = state.size;
        const gap = (size * 0.2) / (n + 4);
        const cell = (size - gap * (n + 1)) / n;
        const radius = Math.min(14, cell * 0.14);

        ctx.fillStyle = "#c6f35a";
        roundRect(ctx, x + 12, y + 12, size, size, 22);
        ctx.fill();
        ctx.fillStyle = "#1c1c25";
        roundRect(ctx, x, y, size, size, 22);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#000";
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const cx = x + gap + c * (cell + gap);
                const cy = y + gap + r * (cell + gap);
                const t = state.grid[r][c];
                roundRect(ctx, cx, cy, cell, cell, radius);
                if (!t) {
                    ctx.fillStyle = "#272732";
                    ctx.fill();
                    continue;
                }
                const { bg, ink } = tileColors(t.value);
                ctx.fillStyle = bg;
                ctx.fill();
                ctx.lineWidth = 3;
                ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
                ctx.stroke();
                const len = String(t.value).length;
                const scale = len <= 2 ? 0.4 : len === 3 ? 0.33 : len === 4 ? 0.26 : 0.21;
                ctx.fillStyle = ink;
                ctx.font = `900 ${Math.round(cell * scale)}px ${DISPLAY}`;
                ctx.fillText(String(t.value), cx + cell / 2, cy + cell / 2 + cell * 0.03);
            }
        }
    }

    function drawTag(ctx, x, y, text, highlight) {
        ctx.font = `700 24px ${UI_FONT}`;
        const w = ctx.measureText(text).width + 40;
        roundRect(ctx, x, y, w, 52, 26);
        ctx.fillStyle = highlight ? "#c6f35a" : "rgba(255, 255, 255, 0.08)";
        ctx.fill();
        if (!highlight) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
            ctx.stroke();
        }
        ctx.fillStyle = highlight ? "#11140a" : "#f3f1ea";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + 20, y + 27);
    }

    async function drawCard() {
        // Make sure the fonts and logo are ready, without hanging if we're offline
        await Promise.race([
            Promise.all([
                document.fonts.load(`900 100px ${DISPLAY}`),
                document.fonts.load(`700 30px ${UI_FONT}`),
                logo.decode(),
            ]).catch(() => {}),
            wait(2500),
        ]);

        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = CARD;
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#0e0e12";
        ctx.fillRect(0, 0, CARD, CARD);
        glow(ctx, 100, 40, 720, "rgba(198, 243, 90, 0.16)");
        glow(ctx, 1020, 1060, 780, "rgba(139, 123, 255, 0.24)");

        if (logo.complete && logo.naturalWidth) {
            const w = 500;
            const h = (w * logo.naturalHeight) / logo.naturalWidth;
            ctx.drawImage(logo, (CARD - w) / 2, 64, w, h);
        }

        // "2048" badge, same as the site logo
        ctx.save();
        ctx.translate(90 + 130, 250 + 55);
        ctx.rotate(-0.035);
        ctx.fillStyle = "#8b7bff";
        roundRect(ctx, -122, -47, 260, 110, 18);
        ctx.fill();
        ctx.fillStyle = "#c6f35a";
        roundRect(ctx, -130, -55, 260, 110, 18);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#000";
        ctx.stroke();
        ctx.fillStyle = "#11140a";
        ctx.font = `900 62px ${DISPLAY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("2048", 0, 4);
        ctx.restore();

        const isBest = state.score > 0 && state.score >= (best[state.size] || 0);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#c6f35a";
        ctx.font = `700 26px ${UI_FONT}`;
        ctx.fillText(state.over ? "FINAL SCORE" : "MY SCORE", 92, 430);
        ctx.fillStyle = "#f3f1ea";
        const score = state.score.toLocaleString();
        fitFont(ctx, score, 900, DISPLAY, 120, 430);
        ctx.fillText(score, 88, 550);

        const tags = [[`BEST TILE  ${maxTile()}`], [`${state.size}×${state.size} BOARD`]];
        if (isBest) tags.push(["NEW BEST!", true]);
        else if (state.won) tags.push(["REACHED 2048", true]);
        tags.forEach(([text, highlight], i) => drawTag(ctx, 90, 596 + i * 66, text, highlight));

        drawBoard(ctx, 570, 236, 420);

        // Call to action
        roundRect(ctx, 90, 830, 900, 160, 24);
        ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
        ctx.stroke();
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#f3f1ea";
        ctx.font = `900 44px ${DISPLAY}`;
        ctx.fillText("Can you beat it?", 130, 900);
        ctx.fillStyle = "#c6f35a";
        ctx.font = `700 32px ${UI_FONT}`;
        ctx.fillText(`Play free → ${CANONICAL.replace(/^https?:\/\//, "")}`, 130, 954);

        return new Promise((resolve, reject) =>
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png")
        );
    }

    // ---------- sharing ----------

    const shareUrl = () => CANONICAL;

    function shareText() {
        return `I scored ${state.score.toLocaleString()} on 2048 by NX Gaming 🎮 Highest tile: ${maxTile()}. Can you beat it?`;
    }

    const canShareFiles = (() => {
        try {
            return !!navigator.canShare &&
                navigator.canShare({ files: [new File([""], "card.png", { type: "image/png" })] });
        } catch {
            return false;
        }
    })();
    const canCopyImage = !!(navigator.clipboard && window.ClipboardItem);

    let shareBlob = null;
    let shareObjectUrl = "";

    function setShareStatus(msg) {
        ui.shareStatus.textContent = msg;
    }

    async function openShare() {
        const text = shareText();
        const url = shareUrl();
        ui.shareWa.href = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
        ui.shareX.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        ui.shareFb.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

        ui.shareNative.hidden = !canShareFiles;
        ui.shareCopy.hidden = !canCopyImage;
        for (const b of [ui.shareNative, ui.shareDownload, ui.shareCopy]) b.disabled = true;
        ui.sharePreview.classList.add("is-loading");
        ui.shareImg.hidden = true;
        setShareStatus("");
        if (!ui.share.open) ui.share.showModal();

        try {
            shareBlob = await drawCard();
            if (shareObjectUrl) URL.revokeObjectURL(shareObjectUrl);
            shareObjectUrl = URL.createObjectURL(shareBlob);
            ui.shareImg.src = shareObjectUrl;
            ui.shareImg.hidden = false;
            for (const b of [ui.shareNative, ui.shareDownload, ui.shareCopy]) b.disabled = false;
        } catch (e) {
            console.warn("Share card failed:", e);
            shareBlob = null;
            setShareStatus("Couldn't create the image here, but the links below still work.");
        } finally {
            ui.sharePreview.classList.remove("is-loading");
        }
    }

    const cardFileName = () => `2048-nx-gaming-${state.score}.png`;

    async function shareImage() {
        if (!shareBlob) return;
        const file = new File([shareBlob], cardFileName(), { type: "image/png" });
        try {
            // The link goes in the text too, since some apps drop the url field when there's an image
            await navigator.share({ files: [file], title: "2048 by NX Gaming", text: `${shareText()} ${shareUrl()}` });
        } catch (e) {
            if (e.name !== "AbortError") setShareStatus("Sharing didn't go through. Try Download instead.");
        }
    }

    function downloadImage() {
        if (!shareBlob) return;
        const a = document.createElement("a");
        a.href = shareObjectUrl;
        a.download = cardFileName();
        a.click();
        setShareStatus("Saved. Post it anywhere you like.");
    }

    async function copyImage() {
        if (!shareBlob) return;
        try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": shareBlob })]);
            setShareStatus("Image copied. Paste it into a chat or post.");
        } catch {
            setShareStatus("Your browser blocked copying the image. Try Download instead.");
        }
    }

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(`${shareText()} ${shareUrl()}`);
            setShareStatus("Link copied.");
        } catch {
            setShareStatus(`Copy this: ${shareUrl()}`);
        }
    }

    // ---------- stats ----------

    function openStats() {
        ui.statPlayed.textContent = stats.played.toLocaleString();
        ui.statWon.textContent = stats.won.toLocaleString();
        ui.statTile.textContent = Math.max(stats.bestTile, maxTile()).toLocaleString();
        ui.statMerges.textContent = stats.merges.toLocaleString();
        ui.statBests.replaceChildren(
            ...SIZES.map((n) => {
                const li = document.createElement("li");
                const label = document.createElement("span");
                const value = document.createElement("b");
                label.textContent = `${n}×${n}`;
                value.textContent = (best[n] || 0).toLocaleString();
                li.append(label, value);
                return li;
            })
        );
        ui.stats.showModal();
    }

    // ---------- input ----------

    document.addEventListener("keydown", (e) => {
        if (document.querySelector("dialog[open]") || e.altKey || e.metaKey) return;
        if ((e.ctrlKey && e.code === "KeyZ") || (!e.ctrlKey && e.code === "KeyU")) {
            e.preventDefault();
            undo();
            return;
        }
        if (e.ctrlKey) return;
        const dir = KEYS[e.key] || KEYS[e.code];
        if (!dir) return;
        e.preventDefault();
        if (!e.repeat) move(dir);
    });

    let swipe = null;
    ui.board.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        swipe = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointerup", (e) => {
        if (!swipe) return;
        const dx = e.clientX - swipe.x;
        const dy = e.clientY - swipe.y;
        swipe = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
        else move(dy > 0 ? "down" : "up");
    });
    window.addEventListener("pointercancel", () => { swipe = null; });

    ui.board.addEventListener("animationend", (e) => {
        if (e.target === ui.board) ui.board.classList.remove("nudge-left", "nudge-right", "nudge-up", "nudge-down");
    });

    // Starting over mid-game takes a second tap, so a stray click can't wipe a long run
    let confirmTimer = 0;
    function resetConfirm() {
        clearTimeout(confirmTimer);
        confirmTimer = 0;
        ui.newGame.textContent = "New game";
        ui.newGame.classList.remove("is-confirm");
    }
    ui.newGame.addEventListener("click", () => {
        if (state.score > 0 && !state.over && !confirmTimer) {
            ui.newGame.textContent = "Sure?";
            ui.newGame.classList.add("is-confirm");
            confirmTimer = setTimeout(resetConfirm, 2500);
            return;
        }
        resetConfirm();
        startGame(state.size);
    });

    ui.undo.addEventListener("click", undo);

    ui.sizes.addEventListener("click", (e) => {
        const b = e.target.closest("[data-size]");
        if (!b || +b.dataset.size === state.size) return;
        resetConfirm();
        prefs.size = +b.dataset.size;
        resumeGame(prefs.size);
    });

    ui.sound.addEventListener("click", () => {
        prefs.sound = !prefs.sound;
        sync();
        if (prefs.sound) tone(523);
    });

    ui.statsBtn.addEventListener("click", openStats);
    ui.shareBtn.addEventListener("click", openShare);
    ui.shareNative.addEventListener("click", shareImage);
    ui.shareDownload.addEventListener("click", downloadImage);
    ui.shareCopy.addEventListener("click", copyImage);
    ui.shareLink.addEventListener("click", copyLink);
    for (const dialog of [ui.stats, ui.share]) {
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) dialog.close(); // click on the backdrop
        });
    }

    // ---------- boot ----------

    ui.year.textContent = new Date().getFullYear();
    resumeGame(prefs.size);

    const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
    if ("serviceWorker" in navigator && location.protocol === "https:" && !isLocal) {
        // Without a trailing slash (nesturex.com) the page sits just outside sw.js's default
        // scope, so widen it to the page path; the site sends Service-Worker-Allowed for this.
        const scope = location.pathname.endsWith("/") ? "./" : location.pathname;
        navigator.serviceWorker.register("sw.js", { scope }).catch(() => {});
    }
})();
