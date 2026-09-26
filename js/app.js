document.addEventListener("DOMContentLoaded", () => {

    // =========================================================================
    // API BASE URL — works from any host (localhost, LAN IP, etc.)
    // =========================================================================

    // Where the backend lives. js/config.js sets CONEXUS_API_BASE when the API
    // is on its own domain (any real deployment). With it unset we fall back to
    // port 8080 on whatever host served this page, which is what local
    // development and LAN testing need.
    const API_BASE = (window.CONEXUS_API_BASE || "").replace(/\/$/, "")
        || `${window.location.protocol}//${window.location.hostname}:8080`;

    // =========================================================================
    // STATE DATA & USER SESSION MANAGEMENT
    // =========================================================================

    const state = {
        currentUser: null, // Holds logged-in user object { id, username, email, displayName, niche, token, accountType, onboardingComplete }
        activeView: "view-home",

        // User Profile & Socials
        profile: {
            displayName: "",
            handle: "",
            bio: "",
            location: "",
            totalReach: "0",
            engagement: "0%"
        },
        socials: [],

        // Creators Database for Discover (Populated from backend)
        creators: [],

        // Inspo feed posts (Populated from backend)
        posts: [],

        // Creator IDs this user has already connected with (Populated from backend)
        connectedCreatorIds: new Set(),
        // People shown in Discover, loaded a page at a time
        discoverPeople: [],
        // creatorId -> PENDING | ACCEPTED
        connectionStatus: {},

        // Connection requests waiting on this user
        connectionRequests: [],

        // Home screen and theme, stored on the account
        preferences: null,

        // People this user is connected with
        connections: [],

        // Notifications (Populated from backend)
        notifications: [],
        unreadNotifications: 0,

        // Top matches for the Home "Mingle" strip
        homePeople: [],

        // Chat Conversations Database (Loaded dynamically per user)
        chats: {},
        activeThreadId: null
    };

    // Platform Metadata Helper
    const platformMeta = {
        youtube:   { name: "YouTube", icon: "youtube", class: "platform-youtube" },
        tiktok:    { name: "TikTok", icon: "tiktok", class: "platform-tiktok" },
        instagram: { name: "Instagram", icon: "instagram", class: "platform-instagram" },
        twitch:    { name: "Twitch", icon: "twitch", class: "platform-twitch" },
        twitter:   { name: "X (Twitter)", icon: "x-logo", class: "platform-twitter" },
        discord:   { name: "Discord", icon: "discord", class: "platform-discord" },
        spotify:   { name: "Spotify", icon: "spotify", class: "platform-spotify" },
        substack:  { name: "Substack", icon: "substack", class: "platform-substack" },
        linkedin:  { name: "LinkedIn", icon: "linkedin", class: "platform-linkedin" },
        website:   { name: "Website", icon: "globe", class: "platform-website" }
    };


    // =========================================================================
    // API HELPERS — every write goes through here so failures are never silent
    // =========================================================================

    /** Turns a thrown fetch/HTTP error into something worth showing the user. */
    function describeApiError(err, fallback) {
        if (err && err.name === "TypeError") {
            return "Cannot reach the Conexus server on port 8080. Is the backend running?";
        }
        return (err && err.message) || fallback;
    }

    /**
     * fetch() wrapper that resolves the API base correctly, and throws on any
     * non-2xx response instead of quietly returning a failed response object.
     */
    async function api(path, options) {
        const opts = options || {};
        const headers = {};
        if (opts.body) headers["Content-Type"] = "application/json";

        // Every protected endpoint needs the session token. The server decides
        // who you are from this — it no longer trusts a userId in the request.
        const token = state.currentUser && state.currentUser.token;
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}${path}`, {
            method: opts.method || "GET",
            headers: headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined
        });

        if (res.status === 401) {
            handleSessionExpired();
            throw new Error("Your session has expired. Please sign in again.");
        }

        if (!res.ok) {
            const problem = await res.json().catch(() => ({}));
            throw new Error(problem.message || problem.error || `Request failed (${res.status})`);
        }
        if (res.status === 204) return null;
        return res.json().catch(() => null);
    }

    /** Drops a token the server has rejected and returns to the sign-in screen. */
    function handleSessionExpired() {
        localStorage.removeItem("conexus_user");
        resetSessionState();
        showAuthScreen();
    }

    /**
     * Forgets everything belonging to the account that just left, so the next
     * person to sign in on this tab never sees it — not even for a frame — and
     * starts on Home rather than wherever the last one was.
     */
    function resetSessionState() {
        state.currentUser = null;
        state.profile = {};
        state.socials = [];
        state.chats = {};
        state.posts = [];
        state.homePeople = [];
        state.discoverPeople = [];
        state.connections = [];
        state.connectionRequests = [];
        state.connectedCreatorIds = new Set();
        state.connectionStatus = {};
        state.notifications = [];
        state.unreadNotifications = 0;
        state.activeThreadId = null;
        forgetPostImages();
        setPendingPhoto(null);
        feedMode = readSetting("conexus_feed_mode", ["friends", "everyone"], "friends");
        feedAuthorFilter = null;
        skippedSteps.clear();
        document.querySelectorAll(".feed-modes .chip").forEach(c =>
            c.classList.toggle("active", c.getAttribute("data-feed-mode") === feedMode));
        showHomePane("overview");

        document.querySelectorAll(".modal-overlay").forEach(m => m.classList.add("hidden"));
        document.getElementById("drawer-chat")?.classList.add("hidden");
        document.getElementById("drawer-notifications")?.classList.add("hidden");
        ["inspo-feed", "inbox-list", "home-creator-scroll", "discover-creators-grid",
         "user-posts-container", "socials-container", "notification-list",
         "rail-people", "rail-requests", "rail-jobs", "pulse-activity", "pulse-platforms",
         "pulse-progress", "feed-people"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = "";
        });

        state.activeView = "view-home";
        document.querySelectorAll(".main-content .view").forEach(v =>
            v.classList.toggle("active-view", v.id === "view-home"));
        document.querySelectorAll(".bottom-nav .nav-item").forEach(n =>
            n.classList.toggle("active", n.getAttribute("data-target") === "view-home"));
    }

    /** Escapes user-supplied text before it goes into innerHTML. */
    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    /** "Alex Popescu" → "AP", "laur" → "LA" — the same rule the server uses. */
    function initials(name) {
        const words = String(name || "?").trim().split(/\s+/);
        const letters = words.length > 1
            ? words[0][0] + words[1][0]
            : words[0].slice(0, 2);
        return letters.toUpperCase();
    }

    /** A line icon from the sprite at the top of index.html. */
    function icon(name, extra) {
        return `<svg class="icon${extra ? " " + extra : ""}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
    }

    /**
     * Each person gets a colour of their own, worked out from who they are,
     * so a thread of initials is no longer a wall of identical purple circles.
     * Keyed by account where there is one, so it follows them everywhere.
     */
    const TONE_HUES = [232, 262, 290, 328, 8, 32, 150, 176, 200];

    function hueFor(userId, name) {
        const key = userId != null && userId !== "" ? `u${userId}` : String(name || "?");
        let h = 7;
        for (const ch of key) h = (h * 31 + ch.codePointAt(0)) >>> 0;
        return TONE_HUES[h % TONE_HUES.length];
    }

    /** The style attribute for an avatar with class "tone" in a template. */
    function toneAttrs(userId, name) {
        return `style="--hue:${hueFor(userId, name)}"`;
    }

    function applyTone(el, userId, name) {
        el.classList.add("tone");
        el.style.setProperty("--hue", hueFor(userId, name));
    }

    /**
     * Only http(s) links may become an href. A profile is shown to other
     * people, so a javascript: link saved on it would run for whoever clicks.
     */
    function safeUrl(url) {
        try {
            const parsed = new URL(String(url || ""), window.location.href);
            return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "#";
        } catch (e) {
            return "#";
        }
    }

    /**
     * Drops flag emoji from a location. Windows has no flag glyphs and shows
     * them as bare letters ("ro Romania"), and accounts store plain names, so
     * this keeps every card reading the same.
     */
    function plainLocation(text) {
        return String(text || "").replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim();
    }

    function greetingFor(date) {
        const h = date.getHours();
        if (h < 5) return "Good evening";
        if (h < 12) return "Good morning";
        if (h < 18) return "Good afternoon";
        return "Good evening";
    }

    /** "Posted 3d ago" / "Posted just now" for a listing. */
    function postedLabel(isoDate) {
        const age = timeAgo(isoDate);
        return age === "Just now" ? "Posted just now"
            : /^\d+[mhd]$/.test(age) ? `Posted ${age} ago` : `Posted ${age}`;
    }

    /** "32m", "3h", "5d" — compact age of a stored timestamp. */
    function timeAgo(isoDate) {
        if (!isoDate) return "Just now";
        const diffMs = Date.now() - new Date(isoDate).getTime();
        if (Number.isNaN(diffMs)) return "Just now";

        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return "Just now";
        if (mins < 60) return `${mins}m`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d`;
        return new Date(isoDate).toLocaleDateString();
    }

    /**
     * A short burst of confetti, for the rare moment worth marking.
     *
     * Deliberately small — about 40 pieces over a second, from an element's own
     * position rather than the whole screen. Uses the Web Animations API so
     * there is no library and nothing to clean up but the nodes themselves.
     * Skipped entirely for anyone who prefers reduced motion.
     */
    function celebrate(originEl) {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const rect = originEl
            ? originEl.getBoundingClientRect()
            : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };

        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height / 2;

        const colours = ["#7180ff", "#5d6eff", "#00F2FE", "#1DB954", "#FF6719", "#E1306C"];
        const layer = document.createElement("div");
        layer.className = "confetti-layer";
        document.body.appendChild(layer);

        for (let i = 0; i < 40; i++) {
            const piece = document.createElement("span");
            piece.className = "confetti-piece";
            piece.style.left = `${originX}px`;
            piece.style.top = `${originY}px`;
            piece.style.background = colours[i % colours.length];
            if (i % 3 === 0) piece.style.borderRadius = "50%";
            layer.appendChild(piece);

            // Spread upward and outward, then fall.
            const angle = (Math.PI * 2 * i) / 40 + (Math.random() - 0.5);
            const distance = 60 + Math.random() * 90;
            const driftX = Math.cos(angle) * distance;
            const riseY = -Math.abs(Math.sin(angle) * distance) - 20;
            const fallY = riseY + 120 + Math.random() * 80;

            piece.animate([
                { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
                { transform: `translate(${driftX * 0.6}px, ${riseY}px) rotate(${Math.random() * 180}deg)`, opacity: 1, offset: 0.35 },
                { transform: `translate(${driftX}px, ${fallY}px) rotate(${Math.random() * 540}deg)`, opacity: 0 }
            ], {
                duration: 900 + Math.random() * 500,
                easing: "cubic-bezier(0.2, 0.7, 0.3, 1)"
            });
        }

        setTimeout(() => layer.remove(), 1600);
    }

    /** Small non-blocking message in the corner of the screen. */
    let toastTimer = null;
    function showToast(message, type) {
        let el = document.getElementById("app-toast");
        if (!el) {
            el = document.createElement("div");
            el.id = "app-toast";
            el.className = "app-toast";
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.classList.toggle("app-toast-error", type === "error");
        el.classList.add("visible");

        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("visible"), 4000);
    }


    // =========================================================================
    // SPLASH & INITIAL AUTH FLOW
    // =========================================================================

    const splashScreen = document.getElementById("splash-screen");
    const authScreen = document.getElementById("auth-screen");
    const authCard = document.getElementById("auth-card");
    const authLandingHero = document.getElementById("auth-landing-hero");
    const btnCloseAuth = document.getElementById("btn-close-auth");
    const btnReopenAuth = document.getElementById("btn-reopen-auth");
    const onboardingScreen = document.getElementById("onboarding-screen");
    const appContainer = document.querySelector(".app");

    function initAppFlow() {
        const storedUser = localStorage.getItem("conexus_user");

        setTimeout(() => {
            if (splashScreen) splashScreen.classList.add("fade-out");

            if (!storedUser) {
                state.currentUser = null;
                showAuthScreen();
            } else {
                try {
                    const user = JSON.parse(storedUser);
                    state.currentUser = user;

                    if (!user.onboardingComplete) {
                        showOnboardingScreen();
                    } else {
                        launchApp();
                    }
                } catch (e) {
                    state.currentUser = null;
                    showAuthScreen();
                }
            }
        }, 1200);
    }

    function showAuthScreen() {
        if (appContainer) appContainer.classList.add("hidden");
        if (onboardingScreen) onboardingScreen.classList.add("hidden");
        if (authScreen) authScreen.classList.remove("hidden");
        if (authCard) authCard.classList.remove("hidden");
        if (authLandingHero) authLandingHero.classList.add("hidden");
    }

    // X close button on sign-in box -> shows clean landing screen hero (app remains hidden)
    if (btnCloseAuth) {
        btnCloseAuth.addEventListener("click", (e) => {
            e.stopPropagation();
            if (authCard) authCard.classList.add("hidden");
            if (authLandingHero) authLandingHero.classList.remove("hidden");
        });
    }

    // Reopen sign-in form from landing hero
    if (btnReopenAuth) {
        btnReopenAuth.addEventListener("click", () => {
            if (authLandingHero) authLandingHero.classList.add("hidden");
            if (authCard) authCard.classList.remove("hidden");
        });
    }

    // ESC key closes sign-in card to landing hero (app stays hidden)
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !state.currentUser && authScreen && !authScreen.classList.contains("hidden")) {
            if (authCard && !authCard.classList.contains("hidden")) {
                authCard.classList.add("hidden");
                if (authLandingHero) authLandingHero.classList.remove("hidden");
            }
        }
    });

    function showOnboardingScreen() {
        if (appContainer) appContainer.classList.add("hidden");
        if (authScreen) authScreen.classList.add("hidden");
        if (onboardingScreen) onboardingScreen.classList.remove("hidden");
        initOnboardingStep(1);
    }

    function launchApp() {
        if (!state.currentUser) {
            showAuthScreen();
            return;
        }
        if (authScreen) authScreen.classList.add("hidden");
        if (onboardingScreen) onboardingScreen.classList.add("hidden");
        if (appContainer) appContainer.classList.remove("hidden");

        // Put the bubble in place before the first transition can run, or it
        // slides in from the left edge on load.
        const bubble = document.getElementById("nav-bubble");
        if (bubble) {
            bubble.classList.add("no-animation");
            requestAnimationFrame(() => {
                moveNavBubble();
                moveHomeUnderline();
                requestAnimationFrame(() => bubble.classList.remove("no-animation"));
            });
        }

        showSkeletons();
        showHomePane(readSetting("conexus_home_tab", ["overview", "feed"], "overview"));
        loadUserData();
    }

    /**
     * Grey stand-ins shaped like the content that is on its way, so the page
     * has its structure from the first frame instead of blank space that
     * jumps when data lands. Each list replaces its own when it renders.
     */
    function showSkeletons() {
        const repeat = (html, n) => Array.from({ length: n }, () => html).join("");

        const post = `
            <div class="inspo-card skel-card" aria-hidden="true">
                <div class="skel-row">
                    <span class="skel skel-circle"></span>
                    <span class="skel-col"><span class="skel skel-line w40"></span><span class="skel skel-line w25"></span></span>
                </div>
                <span class="skel skel-line w90"></span>
                <span class="skel skel-line w70"></span>
            </div>`;
        const person = `
            <div class="creator-card skel-card" aria-hidden="true">
                <span class="skel skel-circle lg"></span>
                <span class="skel skel-line w70"></span>
                <span class="skel skel-line w50"></span>
                <span class="skel skel-line w40"></span>
                <span class="skel skel-block"></span>
            </div>`;
        const row = `
            <div class="skel-row skel-list-row" aria-hidden="true">
                <span class="skel skel-circle"></span>
                <span class="skel-col"><span class="skel skel-line w50"></span><span class="skel skel-line w80"></span></span>
            </div>`;

        const fill = (id, html) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        };
        fill("inspo-feed", repeat(post, 3));
        fill("user-posts-container", post);
        fill("home-creator-scroll", repeat(person, 4));
        fill("discover-creators-grid", repeat(person, 4));
        fill("inbox-list", repeat(row, 4));
        fill("rail-people", repeat(row, 3));
        fill("rail-jobs", repeat(row, 3));
    }

    initAppFlow();


    // =========================================================================
    // API HELPERS & DATA LOADING
    // =========================================================================

    async function loadUserData() {
        if (!state.currentUser) return;
        const userId = state.currentUser.id;

        const name = state.currentUser.displayName || state.currentUser.username;
        const greetingEl = document.getElementById("header-greeting");
        if (greetingEl) greetingEl.textContent = `${greetingFor(new Date())}, ${name}`;

        // Preferences decide which home sections exist, so they go first —
        // otherwise hidden sections render and then vanish.
        await loadPreferences();

        // Everything below is persisted server-side. If a request fails we say so
        // rather than rendering stale placeholder data that looks saved.
        const failed = [];

        try {
            state.profile = await api(`/api/profile`);
        } catch (e) {
            failed.push("profile");
        }
        renderProfileData();

        try {
            state.socials = await api(`/api/socials`);
        } catch (e) {
            failed.push("social links");
        }
        renderSocials();

        try {
            const threads = await api(`/api/chats`);
            state.chats = {};
            threads.forEach(t => { state.chats[t.id] = t; });
        } catch (e) {
            failed.push("messages");
        }
        renderInbox();
        renderPendingSteps();
        await loadConnectionRequests();
        await loadConnections();
        await loadNotifications();

        try {
            const fetchedCreators = await api(`/api/creators`);
            state.creators = fetchedCreators.map(c => ({
                id: c.id,
                userId: c.userId,
                name: c.name,
                niche: c.niche,
                category: c.category,
                location: c.location,
                followers: c.followers,
                match: c.match,
                avatar: c.avatar,
                bgClass: c.bgClass
            }));
        } catch (e) {
            failed.push("creators");
        }

        try {
            const connections = await api(`/api/connections`);
            state.connectedCreatorIds = new Set(connections.map(c => c.creatorId));
            state.connectionStatus = connections.reduce((map, c) => {
                map[c.creatorId] = c.status;
                return map;
            }, {});
        } catch (e) {
            failed.push("connections");
        }
        await loadHomeCreators();
        loadRailJobs();
        await loadDiscover(true);
        loadRecommendedDeals();
        renderCollabStep();
        restoreStepChecks();

        try {
            state.posts = await api(`/api/posts`);
        } catch (e) {
            failed.push("feed");
        }
        renderAllPosts();

        renderPulse();

        // A shared link carries #post-<id>; open it now the feed exists.
        openPostFromHash();

        if (failed.length) {
            showToast(`Could not load your ${failed.join(", ")} from the server.`, "error");
        }
    }

    function renderProfileData() {
        if (!state.currentUser) return;
        const u = state.currentUser;
        const p = state.profile || {};

        const dispName = p.displayName || u.displayName || u.username;
        const set = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        set("profile-display-name", dispName);
        set("profile-handle", p.handle || ("@" + u.username));
        set("profile-bio", p.bio || u.bio || "Welcome to my profile!");
        set("profile-location", plainLocation(p.location || u.location) || "Worldwide");
        set("profile-niche", u.niche || "Creator");
        set("stat-total-reach", p.totalReach || u.totalReach || "0");
        set("stat-engagement", p.engagement || u.engagement || "0%");

        const avatarEl = document.getElementById("profile-avatar");
        if (avatarEl) {
            avatarEl.textContent = initials(dispName);
            avatarEl.className = "creator-avatar pf-avatar";
            applyTone(avatarEl, u.id, dispName);
        }
        document.getElementById("profile-cover")?.style.setProperty("--hue", hueFor(u.id, dispName));

        renderPulseHero();

        // The account chip at the foot of the desktop sidebar.
        set("side-me-name", dispName);
        set("side-me-handle", p.handle || ("@" + u.username));
        const sideAvatar = document.getElementById("side-me-avatar");
        if (sideAvatar) {
            sideAvatar.textContent = initials(dispName);
            sideAvatar.className = "small-avatar";
            applyTone(sideAvatar, u.id, dispName);
        }
    }


    // =========================================================================
    // AUTH TABS & LOGIN / REGISTER HANDLERS
    // =========================================================================

    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const formLogin = document.getElementById("form-login");
    const formRegister = document.getElementById("form-register");
    const authErrorBox = document.getElementById("auth-error-box");

    if (tabLogin && tabRegister) {
        tabLogin.addEventListener("click", () => {
            tabLogin.classList.add("active");
            tabRegister.classList.remove("active");
            formLogin.classList.remove("hidden");
            formRegister.classList.add("hidden");
            authErrorBox.classList.add("hidden");
        });

        tabRegister.addEventListener("click", () => {
            tabRegister.classList.add("active");
            tabLogin.classList.remove("active");
            formRegister.classList.remove("hidden");
            formLogin.classList.add("hidden");
            authErrorBox.classList.add("hidden");
        });
    }

    // LOGIN FORM SUBMISSION
    if (formLogin) {
        formLogin.addEventListener("submit", async (e) => {
            e.preventDefault();
            authErrorBox.classList.add("hidden");

            const identifier = document.getElementById("login-identifier").value.trim();
            const password = document.getElementById("login-password").value.trim();

            try {
                const res = await fetch(`${API_BASE}/api/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ usernameOrEmail: identifier, password: password })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.message || "Invalid credentials");
                }

                localStorage.setItem("conexus_user", JSON.stringify(data));
                state.currentUser = data;

                if (!data.onboardingComplete) {
                    showOnboardingScreen();
                } else {
                    launchApp();
                }
            } catch (err) {
                // No mock/offline fallback: signing in against a fake local user
                // would produce an account the database has never seen, and
                // everything saved afterwards would be silently discarded.
                authErrorBox.textContent = describeApiError(err, "Login failed. Please check your credentials.");
                authErrorBox.classList.remove("hidden");
            }
        });
    }

    // REGISTER FORM SUBMISSION
    if (formRegister) {
        formRegister.addEventListener("submit", async (e) => {
            e.preventDefault();
            authErrorBox.classList.add("hidden");

            const username = document.getElementById("reg-username").value.trim();
            const email = document.getElementById("reg-email").value.trim();
            const displayName = document.getElementById("reg-display-name").value.trim();
            const niche = document.getElementById("reg-niche").value;
            const password = document.getElementById("reg-password").value.trim();

            try {
                const res = await fetch(`${API_BASE}/api/auth/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, email, displayName, niche, password })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.message || "Registration failed");
                }

                localStorage.setItem("conexus_user", JSON.stringify(data));
                state.currentUser = data;
                showOnboardingScreen();

            } catch (err) {
                // A locally invented user id (Date.now()) does not exist in the
                // database, so every later save would be orphaned. Fail loudly.
                authErrorBox.textContent = describeApiError(err, "Registration failed. Please try again.");
                authErrorBox.classList.remove("hidden");
            }
        });
    }

    // TRIAL ACCOUNTS BUTTONS
    const btnTrialCreator = document.getElementById("btn-trial-creator");
    const btnTrialBrand = document.getElementById("btn-trial-brand");

    if (btnTrialCreator) {
        btnTrialCreator.addEventListener("click", () => {
            document.getElementById("login-identifier").value = "alex_creates";
            document.getElementById("login-password").value = "test123";
            formLogin.dispatchEvent(new Event("submit"));
        });
    }

    if (btnTrialBrand) {
        btnTrialBrand.addEventListener("click", () => {
            document.getElementById("login-identifier").value = "brand_techgear";
            document.getElementById("login-password").value = "test123";
            formLogin.dispatchEvent(new Event("submit"));
        });
    }

    // SIGN OUT BUTTON
    const btnSignOut = document.getElementById("btn-signout");
    if (btnSignOut) {
        btnSignOut.addEventListener("click", async () => {
            // Revoke the token so it cannot be reused if it was ever captured.
            try {
                await api("/api/auth/logout", { method: "POST" });
            } catch (e) {
                // Signing out locally matters more than the server round-trip.
            }
            localStorage.removeItem("conexus_user");
            resetSessionState();
            if (splashScreen) splashScreen.classList.remove("fade-out");
            showAuthScreen();
            setTimeout(() => {
                if (splashScreen) splashScreen.classList.add("fade-out");
            }, 1000);
        });
    }


    // =========================================================================
    // MULTI-STEP ONBOARDING ENGINE
    // =========================================================================

    let currentOnboardStep = 1;
    let onboardAccountType = "creator";

    function initOnboardingStep(step) {
        currentOnboardStep = step;

        const fill = document.getElementById("onboarding-progress-fill");
        const indicator = document.getElementById("onboarding-step-indicator");
        if (fill) fill.style.width = (step * 25) + "%";
        if (indicator) indicator.textContent = `Step ${step} of 4`;

        for (let i = 1; i <= 4; i++) {
            const stepEl = document.getElementById(`onboard-step-${i}`);
            if (stepEl) {
                if (i === step) stepEl.classList.remove("hidden");
                else stepEl.classList.add("hidden");
            }
        }
    }

    // Step 1: Account Type selector
    const cardTypeCreator = document.getElementById("card-type-creator");
    const cardTypeBusiness = document.getElementById("card-type-business");

    if (cardTypeCreator && cardTypeBusiness) {
        cardTypeCreator.addEventListener("click", () => {
            cardTypeCreator.classList.add("selected");
            cardTypeBusiness.classList.remove("selected");
            onboardAccountType = "creator";
        });
        cardTypeBusiness.addEventListener("click", () => {
            cardTypeBusiness.classList.add("selected");
            cardTypeCreator.classList.remove("selected");
            onboardAccountType = "business";
        });
    }

    // Step 2: Goal Chips toggle
    document.querySelectorAll(".goal-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            chip.classList.toggle("selected");
        });
    });

    // Step 3: Add Social Row
    const btnAddOnboardSocial = document.getElementById("btn-add-onboard-social");
    const onboardSocialsList = document.getElementById("onboarding-socials-list");

    if (btnAddOnboardSocial && onboardSocialsList) {
        btnAddOnboardSocial.addEventListener("click", () => {
            const row = document.createElement("div");
            row.className = "onboarding-social-row";
            row.innerHTML = `
                <select class="onboard-platform">
                    <option value="youtube">YouTube</option>
                    <option value="tiktok">TikTok</option>
                    <option value="instagram">Instagram</option>
                    <option value="twitch">Twitch</option>
                    <option value="twitter">X (Twitter)</option>
                    <option value="website">Website</option>
                </select>
                <input type="text" class="onboard-handle" placeholder="@handle or Channel">
                <input type="text" class="onboard-followers" placeholder="Followers (e.g. 15K)">
            `;
            onboardSocialsList.appendChild(row);
        });
    }

    // Step Next / Back Buttons
    document.getElementById("btn-onboard-next-1")?.addEventListener("click", () => initOnboardingStep(2));
    document.getElementById("btn-onboard-back-2")?.addEventListener("click", () => initOnboardingStep(1));
    document.getElementById("btn-onboard-next-2")?.addEventListener("click", () => initOnboardingStep(3));
    document.getElementById("btn-onboard-back-3")?.addEventListener("click", () => initOnboardingStep(2));
    document.getElementById("btn-onboard-next-3")?.addEventListener("click", () => initOnboardingStep(4));
    document.getElementById("btn-onboard-back-4")?.addEventListener("click", () => initOnboardingStep(3));

    // Step 4: SUBMIT ONBOARDING
    document.getElementById("btn-onboard-submit")?.addEventListener("click", async () => {
        if (!state.currentUser) return;

        const selectedGoals = Array.from(document.querySelectorAll(".goal-chip.selected"))
            .map(chip => chip.getAttribute("data-goal"))
            .join(", ");

        const location = document.getElementById("onboard-location")?.value.trim() || "Worldwide";
        const bio = document.getElementById("onboard-bio")?.value.trim() || "Welcome to my Conexus profile!";

        // Gather Socials
        const socialsList = [];
        document.querySelectorAll(".onboarding-social-row").forEach(row => {
            const platform = row.querySelector(".onboard-platform")?.value;
            const handle = row.querySelector(".onboard-handle")?.value.trim();
            const followers = row.querySelector(".onboard-followers")?.value.trim() || "0";
            if (handle) {
                socialsList.push({ platform, handle, followers });
            }
        });

        const onboardingPayload = {
            userId: state.currentUser.id,
            accountType: onboardAccountType,
            goals: selectedGoals,
            bio: bio,
            location: location,
            socials: socialsList
        };

        try {
            const res = await fetch(`${API_BASE}/api/onboarding/complete`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${state.currentUser.token}`
                },
                body: JSON.stringify(onboardingPayload)
            });

            if (!res.ok) {
                const problem = await res.json().catch(() => ({}));
                throw new Error(problem.message || "Could not save your onboarding details.");
            }

            const updatedUser = await res.json();
            // Onboarding is not an authentication event, so the response carries
            // no token — keep the session we already have or we'd be logged out.
            updatedUser.token = updatedUser.token || state.currentUser.token;
            localStorage.setItem("conexus_user", JSON.stringify(updatedUser));
            state.currentUser = updatedUser;
        } catch (e) {
            // Marking onboarding complete only in localStorage used to hide this
            // failure: the flag never reached the database, so onboarding
            // reappeared on the next device or after clearing site data.
            showToast(describeApiError(e, "Could not save your profile. Please try again."), "error");
            return;
        }

        launchApp();
    });


    // =========================================================================
    // VIEW SWITCHER & NAVIGATION
    // =========================================================================

    /** The view to return to when leaving someone's profile. */
    let previousView = "view-home";

    // The bottom nav on phones and the sidebar on desktop mark the same tab.
    const navItems = document.querySelectorAll(".bottom-nav .nav-item, .side-nav .side-link");
    const views = document.querySelectorAll(".main-content .view");

    function switchView(targetViewId) {
        if (!state.currentUser) {
            showAuthScreen();
            return;
        }

        // Remember where we came from so Back on a profile returns there,
        // without ever pointing back at another profile.
        if (targetViewId === "view-user-profile" && state.activeView !== "view-user-profile") {
            previousView = state.activeView;
        }

        state.activeView = targetViewId;

        navItems.forEach(item => {
            if (item.getAttribute("data-target") === targetViewId) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });

        views.forEach(view => {
            if (view.id === targetViewId) {
                view.classList.add("active-view");
            } else {
                view.classList.remove("active-view");
            }
        });

        moveNavBubble();
        if (targetViewId === "view-discover") requestAnimationFrame(moveDiscoverUnderline);
        if (targetViewId === "view-home") requestAnimationFrame(moveHomeUnderline);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    /**
     * Slides the pill behind whichever tab is active.
     *
     * Measured from the button rather than hardcoded, so it stays right at any
     * width and if tabs are ever added or removed. Views without a tab of their
     * own — someone's profile, say — hide it instead of leaving it stranded.
     */
    function moveNavBubble() {
        const bubble = document.getElementById("nav-bubble");
        if (!bubble) return;

        const active = document.querySelector(".bottom-nav .nav-item.active");
        if (!active) {
            bubble.style.opacity = "0";
            return;
        }

        // On desktop the bottom nav is not shown at all; there is nothing to
        // measure until a resize brings it back.
        if (getComputedStyle(active.parentElement).display === "none") return;

        const navRect = active.parentElement.getBoundingClientRect();
        const itemRect = active.getBoundingClientRect();

        // Measuring while the nav has no layout — a hidden tab, a collapsed
        // window — would pin the bubble at zero width in the wrong place. Wait
        // for real dimensions instead.
        if (itemRect.width === 0) {
            bubble.style.opacity = "0";
            clearTimeout(navBubbleRetry);
            navBubbleRetry = setTimeout(moveNavBubble, 120);
            return;
        }

        bubble.style.width = `${itemRect.width}px`;
        bubble.style.transform = `translateX(${itemRect.left - navRect.left}px)`;
        bubble.style.opacity = "1";
    }

    let navBubbleRetry = null;

    // Keep it aligned when the viewport changes size.
    window.addEventListener("resize", moveNavBubble);

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const target = item.getAttribute("data-target");
            if (target) switchView(target);
        });
    });

    // Header nav icons (e.g. Messages icon moved to header) also need switchView wired up
    document.querySelectorAll(".header-nav-icon[data-target]").forEach(item => {
        item.addEventListener("click", () => {
            const target = item.getAttribute("data-target");
            if (target) switchView(target);
        });
    });

    document.addEventListener("click", (e) => {
        const trigger = e.target.closest(".nav-switch-trigger");
        if (trigger) {
            const target = trigger.getAttribute("data-target");
            if (target) switchView(target);
        }
    });


    // =========================================================================
    // NOTIFICATIONS PANEL TOGGLE
    // =========================================================================

    const btnNotifications = document.getElementById("btn-notifications");
    const drawerNotifications = document.getElementById("drawer-notifications");
    const btnCloseNotifications = document.getElementById("btn-close-notifications");

    if (btnNotifications && drawerNotifications) {
        btnNotifications.addEventListener("click", (e) => {
            e.stopPropagation();
            const opening = drawerNotifications.classList.contains("hidden");
            drawerNotifications.classList.toggle("hidden");
            // Re-read on open so the list reflects anything that happened since.
            if (opening) loadNotifications();
        });

        btnCloseNotifications?.addEventListener("click", () => {
            drawerNotifications.classList.add("hidden");
        });

        document.addEventListener("click", (e) => {
            if (!drawerNotifications.contains(e.target) && !btnNotifications.contains(e.target)) {
                drawerNotifications.classList.add("hidden");
            }
        });
    }


    // =========================================================================
    // DISCOVER & SEARCH FILTER ENGINE
    // =========================================================================

    const discoverGrid = document.getElementById("discover-creators-grid");
    const searchInput = document.getElementById("discover-search-input");
    const searchClear = document.getElementById("discover-search-clear");
    const filterChipsContainer = document.getElementById("discover-filter-chips");

    let currentCategory = "all";

    /** One person's card, used by both Discover and the Home "Mingle" strip. */
    function creatorCardHtml(c) {
        // Keyed by creator card where there is one, otherwise by account.
        const key = c.id || `u${c.userId}`;
        const connected = c.connected !== undefined
            ? c.connected
            : state.connectedCreatorIds.has(key);
        // The server reports the status alongside the flag; fall back to what we
        // recorded locally for cards rendered outside Discover.
        const status = c.status || state.connectionStatus[key];
        // INCOMING: they asked you. Pressing the button answers yes.
        const incoming = connected && status === "INCOMING";
        const label = !connected ? "Connect"
            : incoming ? "Accept"
            : status === "PENDING" ? "Requested" : "Connected";
        return `
            <article class="creator-card discover-card" data-creator-id="${escapeHtml(c.id || "")}" data-owner-id="${escapeHtml(c.userId || "")}">
                <div class="creator-avatar tone" ${toneAttrs(c.userId, c.name)}>${escapeHtml(c.avatar || initials(c.name))}</div>
                <button class="creator-more" aria-label="Open profile">•••</button>
                <h3>${escapeHtml(c.name)}</h3>
                <p class="creator-type">${escapeHtml(c.niche)}</p>
                <div class="creator-info">${escapeHtml(plainLocation(c.location))}</div>
                <div class="creator-followers">${escapeHtml(c.followers)} followers</div>
                ${c.match ? `<div class="match"><span>${escapeHtml(c.match)}%</span> match</div>` : ""}
                <button class="connect-button ${connected && !incoming ? "connected" : ""}" data-name="${escapeHtml(c.name)}">${label}</button>
            </article>
        `;
    }

    /**
     * The Home "Mingle" strip — your best matches among real accounts.
     *
     * Read from the same endpoint as Discover, which leaves out your own
     * account and knows connections made in either direction. The catalog it
     * used to read listed you among your own suggestions.
     */
    async function loadHomeCreators() {
        try {
            const data = await api("/api/users?page=0&size=4");
            state.homePeople = data.items || [];
        } catch (err) {
            state.homePeople = [];
        }
        renderHomeCreators();
    }

    function renderHomeCreators() {
        const strip = document.getElementById("home-creator-scroll");
        if (!strip) return;

        const top = state.homePeople || [];
        strip.innerHTML = top.length
            ? top.map(creatorCardHtml).join("")
            : `<div class="empty-inline">No creators to show yet.</div>`;

        renderRailPeople();
        bindConnectButtons();
    }

    // =========================================================================
    // DESKTOP RIGHT COLUMN — suggestions, requests and roles beside any view
    // =========================================================================

    function renderRailPeople() {
        const el = document.getElementById("rail-people");
        if (!el) return;

        const people = state.homePeople || [];
        el.innerHTML = people.length ? people.map(c => {
            const status = c.status || null;
            const incoming = c.connected && status === "INCOMING";
            const label = !c.connected ? "Connect"
                : incoming ? "Accept"
                : status === "PENDING" ? "Requested" : "Connected";
            return `
                <div class="rail-person" data-creator-id="${escapeHtml(c.id || "")}" data-owner-id="${escapeHtml(c.userId || "")}">
                    <div class="creator-avatar tone" ${toneAttrs(c.userId, c.name)}>${escapeHtml(c.avatar || initials(c.name))}</div>
                    <div class="rail-person-info">
                        <strong>${escapeHtml(c.name)}</strong>
                        <span>${escapeHtml(c.niche)}${c.match ? ` · ${escapeHtml(c.match)}% match` : ""}</span>
                    </div>
                    <button class="connect-button ${c.connected && !incoming ? "connected" : ""}">${label}</button>
                </div>
            `;
        }).join("") : `<div class="rail-empty">No suggestions right now.</div>`;
    }

    function renderRailRequests() {
        const card = document.getElementById("rail-requests-card");
        const el = document.getElementById("rail-requests");
        if (!card || !el) return;

        const requests = state.connectionRequests || [];
        card.classList.toggle("hidden", requests.length === 0);
        el.innerHTML = requests.map(req => `
            <div class="rail-request">
                <div class="creator-avatar tone" ${toneAttrs(req.requesterId, req.name)}${req.requesterId ? ` data-user-id="${escapeHtml(req.requesterId)}"` : ""}>${escapeHtml(req.avatar || initials(req.name))}</div>
                <div class="rail-person-info">
                    <strong>${escapeHtml(req.name)}</strong>
                    <span>${escapeHtml(req.niche || "Conexus Creator")}</span>
                </div>
                <div class="rail-request-actions">
                    <button class="btn-accept-request" data-request-id="${escapeHtml(req.id)}">Accept</button>
                    <button class="btn-decline-request" data-request-id="${escapeHtml(req.id)}" aria-label="Decline">✕</button>
                </div>
            </div>
        `).join("");
    }

    /** A few open roles you could apply to — your own listings are left out. */
    async function loadRailJobs() {
        const el = document.getElementById("rail-jobs");
        if (!el) return;
        try {
            const data = await api("/api/jobs?size=8");
            const jobs = (data.items || []).filter(j => !j.mine).slice(0, 3);
            el.innerHTML = jobs.length ? jobs.map(j => `
                <button class="rail-job">
                    <strong>${escapeHtml(j.title)}</strong>
                    <span>${escapeHtml(j.company || "")}${j.pay ? ` · <b class="rail-job-pay">${escapeHtml(j.pay)}</b>` : ""}</span>
                </button>
            `).join("") : `<div class="rail-empty">No open roles right now.</div>`;
        } catch (err) {
            el.innerHTML = `<div class="rail-empty">Could not load roles.</div>`;
        }
    }

    document.getElementById("rail-see-jobs")?.addEventListener("click", () => openDiscover("jobs"));
    document.addEventListener("click", (e) => {
        if (e.target.closest(".rail-job")) openDiscover("jobs");
    });

    /** Everyone loaded into Discover so far, and whether there is more. */
    let discoverPage = 0;
    let discoverHasMore = false;
    let discoverLoading = false;

    /**
     * Loads a page of people into Discover.
     *
     * Discover used to list the creators catalog, which was mostly cards with
     * no account behind them. It lists real accounts now, ten at a time, with
     * search and category applied on the server so paging stays correct.
     */
    async function loadDiscover(reset) {
        if (discoverLoading) return;
        discoverLoading = true;

        if (reset) {
            discoverPage = 0;
            state.discoverPeople = [];
        }

        const query = searchInput ? searchInput.value.trim() : "";
        const params = new URLSearchParams({ page: discoverPage, size: 10 });
        if (query) params.set("search", query);
        if (currentCategory && currentCategory !== "all") params.set("category", currentCategory);

        try {
            const data = await api(`/api/users?${params.toString()}`);
            state.discoverPeople = state.discoverPeople.concat(data.items || []);
            discoverHasMore = !!data.hasMore;
            discoverTotal = data.total || 0;
        } catch (err) {
            if (reset) state.discoverPeople = [];
            discoverHasMore = false;
            showToast(describeApiError(err, "Could not load creators."), "error");
        } finally {
            discoverLoading = false;
        }

        renderDiscoverCreators();
    }

    let discoverTotal = 0;

    function renderDiscoverCreators() {
        if (!discoverGrid) return;

        const people = state.discoverPeople || [];

        if (!people.length) {
            discoverGrid.innerHTML = `
                <div class="empty-card">
                    No creators found matching your search criteria.
                </div>
            `;
            renderLoadMore();
            return;
        }

        discoverGrid.innerHTML = people.map(creatorCardHtml).join("");
        bindConnectButtons();
        renderLoadMore();
    }

    /** The "Load more" control lives under the grid, outside it. */
    function renderLoadMore() {
        let btn = document.getElementById("btn-load-more-creators");

        if (!discoverHasMore) {
            if (btn) btn.remove();
            return;
        }

        if (!btn) {
            btn = document.createElement("button");
            btn.id = "btn-load-more-creators";
            btn.className = "btn-load-more";
            btn.addEventListener("click", () => {
                discoverPage += 1;
                btn.textContent = "Loading…";
                btn.disabled = true;
                loadDiscover(false);
            });
            discoverGrid.insertAdjacentElement("afterend", btn);
        }

        const shown = (state.discoverPeople || []).length;
        btn.disabled = false;
        btn.textContent = `Load more (${shown} of ${discoverTotal})`;
    }

    if (searchInput) {
        // Debounced: filtering happens server side now, so do not fire a
        // request on every keystroke.
        let searchTimer = null;
        searchInput.addEventListener("input", () => {
            searchClear?.classList.toggle("hidden", searchInput.value.length === 0);
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => loadDiscover(true), 250);
        });

        searchClear?.addEventListener("click", () => {
            searchInput.value = "";
            searchClear.classList.add("hidden");
            loadDiscover(true);
        });
    }

    if (filterChipsContainer) {
        filterChipsContainer.querySelectorAll(".chip").forEach(chip => {
            chip.addEventListener("click", () => {
                filterChipsContainer.querySelectorAll(".chip").forEach(ch => ch.classList.remove("active"));
                chip.classList.add("active");
                currentCategory = chip.getAttribute("data-category") || "all";
                loadDiscover(true);
            });
        });
    }



    // =========================================================================
    // CONNECT BUTTON TOGGLE
    // =========================================================================

    /**
     * Records what a connect/disconnect did, in every list that shows it.
     * "connected" can come back straight away when the other person had
     * already asked — pressing Accept on their card answers that request.
     */
    function applyConnectionResult(data, targetId, creatorId, ownerId) {
        const connected = data.status !== "disconnected";
        const status = data.status === "requested" ? "PENDING" : connected ? "ACCEPTED" : null;

        if (connected) {
            state.connectedCreatorIds.add(targetId);
            state.connectionStatus[targetId] = status;
            showToast(data.status === "requested"
                ? "Request sent — they'll see it in their messages"
                : "You're connected");
        } else {
            state.connectedCreatorIds.delete(targetId);
            delete state.connectionStatus[targetId];
        }

        const matches = p => (creatorId && p.id === creatorId)
            || (ownerId && String(p.userId) === String(ownerId));
        [state.discoverPeople, state.homePeople].forEach(list => (list || []).forEach(p => {
            if (!matches(p)) return;
            p.connected = connected;
            p.status = status;
        }));

        renderDiscoverCreators();
        renderHomeCreators();
        loadConnections();
        if (data.status === "connected") loadConnectionRequests();
    }

    function bindConnectButtons() {
        document.querySelectorAll(".connect-button").forEach(button => {
            button.onclick = async (e) => {
                e.stopPropagation();
                if (!state.currentUser) {
                    showAuthScreen();
                    return;
                }

                const creatorCard = button.closest(".creator-card, .rail-person");
                if (!creatorCard) return;

                const creatorId = creatorCard.getAttribute("data-creator-id") || null;
                const ownerId = creatorCard.getAttribute("data-owner-id") || null;
                if (!creatorId && !ownerId) return;

                // Whichever identifies them; most people have no catalog card.
                const targetId = creatorId || `u${ownerId}`;
                const reqBody = creatorId
                    ? { targetCreatorId: creatorId }
                    : { targetUserId: parseInt(ownerId, 10) };

                button.disabled = true;
                try {
                    const data = await api("/api/connections/toggle", { method: "POST", body: reqBody });
                    applyConnectionResult(data, targetId, creatorId, ownerId);
                } catch (err) {
                    // Toggling the button locally on failure made an unsaved
                    // connection look saved until the next reload.
                    showToast(describeApiError(err, "Could not update this connection."), "error");
                } finally {
                    button.disabled = false;
                }
            };
        });
    }
    bindConnectButtons();


    // =========================================================================
    // LIKE & COMMENT BUTTON INTERACTION
    // =========================================================================

    /**
     * Opens the share sheet for a post.
     *
     * This used to copy the link and show a toast. A four second line at the
     * bottom of the screen was too easy to miss for something you deliberately
     * clicked, and it silently did nothing at all when the clipboard was
     * blocked. The sheet always shows the link, so there is something to see
     * and something to copy by hand if the button cannot.
     */
    function sharePost(postCard) {
        const postId = postCard.getAttribute("data-post-id");
        if (!postId) return;

        const post = state.posts.find(p => String(p.id) === String(postId));
        const url = `${location.origin}${location.pathname}#post-${postId}`;

        shareUrl = url;
        shareText = post ? `${post.authorName} on Conexus: ${post.content}` : "A post on Conexus";

        const authorEl = document.getElementById("share-post-author");
        const excerptEl = document.getElementById("share-post-excerpt");
        if (authorEl) authorEl.textContent = post ? post.authorName : "Conexus";
        if (excerptEl) excerptEl.textContent = post ? post.content : "";

        const input = document.getElementById("share-link-input");
        if (input) input.value = url;

        const copyBtn = document.getElementById("btn-copy-share-link");
        if (copyBtn) copyBtn.textContent = "Copy";

        // Only offer the native sheet where the browser actually has one.
        const nativeBtn = document.getElementById("btn-native-share");
        if (nativeBtn) nativeBtn.style.display = navigator.share ? "" : "none";

        document.getElementById("modal-share")?.classList.remove("hidden");
        if (input) { input.focus(); input.select(); }
    }

    /** The link and text for whichever post the share sheet is showing. */
    let shareUrl = "";
    let shareText = "";

    document.getElementById("btn-close-share")?.addEventListener("click", () => {
        document.getElementById("modal-share")?.classList.add("hidden");
    });

    document.getElementById("btn-copy-share-link")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const input = document.getElementById("share-link-input");
        if (input) { input.focus(); input.select(); }

        const ok = await copyToClipboard(shareUrl);
        btn.textContent = ok ? "Copied ✓" : "Press Ctrl+C";
        setTimeout(() => { btn.textContent = "Copy"; }, 2500);
    });

    document.getElementById("btn-native-share")?.addEventListener("click", async () => {
        if (!navigator.share) return;
        try {
            await navigator.share({ title: "Conexus", text: shareText, url: shareUrl });
            document.getElementById("modal-share")?.classList.add("hidden");
        } catch (err) {
            // The user dismissing the sheet is not a failure.
            if (err && err.name !== "AbortError") {
                showToast(describeApiError(err, "Could not open the share sheet."), "error");
            }
        }
    });

    document.getElementById("btn-open-share-link")?.addEventListener("click", () => {
        window.open(shareUrl, "_blank", "noopener");
    });

    /**
     * navigator.clipboard needs a secure origin and a real user gesture, and is
     * unavailable in some browsers, so fall back to the legacy approach before
     * giving up.
     */
    async function copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                // fall through
            }
        }

        try {
            const scratch = document.createElement("textarea");
            scratch.value = text;
            scratch.setAttribute("readonly", "");
            scratch.style.position = "fixed";
            scratch.style.opacity = "0";
            document.body.appendChild(scratch);
            scratch.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(scratch);
            return ok;
        } catch (err) {
            return false;
        }
    }

    // Anywhere a person is named — a post author, a comment author, the chat
    // header — opens their profile.
    document.addEventListener("click", (e) => {
        // A control inside a person's row does its own job. stopPropagation in
        // those handlers cannot help: they are registered on document too, so
        // this listener would still run.
        if (e.target.closest("button, a, input, textarea, select, .comment-actions")) return;

        const personEl = e.target.closest("[data-user-id]");
        if (!personEl) return;
        openUserProfile(personEl.getAttribute("data-user-id"));
    });

    window.addEventListener("hashchange", openPostFromHash);

    document.addEventListener("click", (e) => {
        const shareBtn = e.target.closest(".btn-share");
        if (!shareBtn) return;
        e.stopPropagation();
        const card = shareBtn.closest(".inspo-card");
        if (card) sharePost(card);
    });

    /** Opens the post named in the URL hash, so a shared link lands on it. */
    function openPostFromHash() {
        const match = /^#post-(\w+)$/.exec(location.hash || "");
        if (!match) return;

        showPostInFeed(match[1]);
    }

    /**
     * Brings a post into view on the Home feed and opens it. The feed may be
     * narrowed to friends, so the post opens even when its card is not shown.
     */
    function showPostInFeed(postId) {
        if (!state.posts.some(p => String(p.id) === String(postId))) return;
        switchView("view-home");
        showHomePane("feed");
        document.querySelector(`#inspo-feed .inspo-card[data-post-id="${postId}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        openPostCommentsModal(postId);
    }

    document.addEventListener("click", async (e) => {
        const likeBtn = e.target.closest(".btn-like");
        if (!likeBtn) return;

        if (!state.currentUser) {
            showAuthScreen();
            return;
        }

        // The button appears both in the feed and in the post detail modal.
        const card = likeBtn.closest("[data-post-id]");
        const postId = card ? card.getAttribute("data-post-id") : null;
        if (!postId) return;

        // Persisted against this account, so one person's like no longer shows
        // up as liked for everyone else.
        likeBtn.disabled = true;
        try {
            const updated = await api(`/api/posts/${postId}/like`, { method: "PUT" });
            const idx = state.posts.findIndex(p => String(p.id) === String(updated.id));
            if (idx !== -1) state.posts[idx] = updated;

            renderAllPosts();
            renderPostDetailLike(updated);
        } catch (err) {
            showToast(describeApiError(err, "Could not save your like."), "error");
        } finally {
            likeBtn.disabled = false;
        }
    });


    // =========================================================================
    // MESSAGING & CHAT SYSTEM
    // =========================================================================

    const drawerChat = document.getElementById("drawer-chat");
    const btnCloseChat = document.getElementById("btn-close-chat");
    const inboxList = document.getElementById("inbox-list");
    const chatMessagesContainer = document.getElementById("chat-messages-container");
    const formChatSend = document.getElementById("form-chat-send");
    const chatInputText = document.getElementById("chat-input-text");

    const chatHeaderAvatar = document.getElementById("chat-header-avatar");
    const chatHeaderName = document.getElementById("chat-header-name");
    const chatHeaderStatus = document.getElementById("chat-header-status");

    /**
     * The "N Pending" pill counted a number nobody maintained. Count the steps
     * actually rendered underneath it instead.
     */
    function renderPendingSteps() {
        renderPulseNext();
        const pill = document.querySelector("#view-recommendations .status-pill");
        if (!pill) return;

        // Only visible steps still unticked count as pending.
        const cards = document.querySelectorAll("#view-recommendations .step-card:not(.hidden)");
        const pending = [...cards].filter(card => !card.querySelector(".step-checkbox")?.checked).length;

        pill.textContent = pending ? `${pending} Pending` : "All done";
    }

    /** Ticked steps are remembered per account on this device. */
    function stepStorageKey() {
        return `conexus_steps_${state.currentUser ? state.currentUser.id : "anon"}`;
    }

    function stepKey(card, i) {
        return card.getAttribute("data-step") || `step-${i}`;
    }

    function restoreStepChecks() {
        let done = [];
        try { done = JSON.parse(localStorage.getItem(stepStorageKey()) || "[]"); } catch (e) { done = []; }

        document.querySelectorAll("#view-recommendations .step-card").forEach((card, i) => {
            const box = card.querySelector(".step-checkbox");
            if (box) box.checked = done.includes(stepKey(card, i));
            card.classList.toggle("done", !!box?.checked);
        });
        renderPendingSteps();
    }

    document.querySelectorAll("#view-recommendations .step-checkbox").forEach(box => {
        box.addEventListener("change", () => {
            const done = [];
            document.querySelectorAll("#view-recommendations .step-card").forEach((card, i) => {
                const checked = card.querySelector(".step-checkbox")?.checked;
                card.classList.toggle("done", !!checked);
                if (checked) done.push(stepKey(card, i));
            });
            try { localStorage.setItem(stepStorageKey(), JSON.stringify(done)); } catch (e) { /* private mode */ }
            renderPendingSteps();
        });
    });

    /**
     * The first step names a real person: your strongest match you are not yet
     * connected with. It used to name Alex Popescu for everyone — including
     * Alex, who was advised to collaborate with himself.
     */
    function renderCollabStep() {
        const card = document.getElementById("step-collab");
        if (!card) return;

        const pick = (state.homePeople || []).find(p => !p.connected) || (state.homePeople || [])[0];
        card.classList.toggle("hidden", !pick);
        if (!pick) { renderPendingSteps(); return; }

        const title = document.getElementById("step-collab-title");
        const desc = document.getElementById("step-collab-desc");
        const action = document.getElementById("step-collab-action");
        if (title) title.textContent = `Collaborate with ${pick.name}`;
        if (desc) {
            desc.textContent = pick.match
                ? `${pick.match}% audience match in ${pick.niche || "your niche"}. A joint short could put you both in front of new viewers.`
                : `A ${pick.niche || "creator"} whose audience could overlap with yours. A joint short is an easy first collab.`;
        }
        if (action) {
            action.setAttribute("data-creator", pick.name);
            action.setAttribute("data-user-id", pick.userId || "");
        }
        card.setAttribute("data-step", `collab-${pick.userId || pick.id}`);
        renderPendingSteps();
    }

    /** Wording for each kind of notification. */
    const NOTIFICATION_TEXT = {
        POST_LIKE:     { icon: "heart", tone: "like", verb: "liked your post" },
        POST_COMMENT:  { icon: "comment", tone: "info", verb: "commented on your post" },
        COMMENT_REPLY: { icon: "reply", tone: "info", verb: "replied to your comment" },
        COMMENT_LIKE:  { icon: "heart", tone: "like", verb: "liked your comment" },
        CONNECTION:    { icon: "user-plus", tone: "good", verb: "connected with you" },
        MESSAGE:       { icon: "mail", tone: "info", verb: "sent you a message" },
        JOB_APPLICATION: { icon: "file", tone: "work", verb: "applied to your listing" }
    };

    async function loadNotifications() {
        try {
            const data = await api("/api/notifications");
            state.notifications = data.items || [];
            state.unreadNotifications = data.unread || 0;
        } catch (err) {
            state.notifications = [];
            state.unreadNotifications = 0;
        }
        renderNotifications();
    }

    /**
     * The drawer used to hold four hardcoded entries, then a list derived from
     * unread conversations. These are real records of what other people did.
     */
    function renderNotifications() {
        renderPulseActivity();
        const list = document.getElementById("notification-list");
        const badge = document.getElementById("notification-count");

        if (badge) {
            badge.textContent = state.unreadNotifications;
            badge.classList.toggle("hidden", state.unreadNotifications === 0);
        }

        if (!list) return;

        if (!state.notifications.length) {
            list.innerHTML = `
                <div class="empty-inline">
                    Nothing yet. Likes, comments and messages will show up here.
                </div>
            `;
            return;
        }

        list.innerHTML = state.notifications.map(n => {
            const meta = NOTIFICATION_TEXT[n.type] || { icon: "bell", tone: "info", verb: "interacted with you" };
            return `
                <div class="notification-item${n.read ? "" : " unread"}" data-notification-id="${escapeHtml(n.id)}">
                    <div class="noti-icon noti-${meta.tone}">${icon(meta.icon)}</div>
                    <div class="noti-content">
                        <p><strong>${escapeHtml(n.actorName || "Someone")}</strong> ${n.type === "CONNECTION" && n.excerpt ? escapeHtml(n.excerpt) : meta.verb}.</p>
                        ${n.excerpt && n.type !== "CONNECTION" ? `<p class="noti-excerpt">${escapeHtml(n.excerpt)}</p>` : ""}
                        <span>${escapeHtml(timeAgo(n.createdAt))}</span>
                    </div>
                </div>
            `;
        }).join("");

        list.querySelectorAll(".notification-item").forEach(item => {
            item.addEventListener("click", () => openNotification(item.getAttribute("data-notification-id")));
        });
    }

    /** Marks a notification read and goes to whatever it is about. */
    async function openNotification(notificationId) {
        const n = state.notifications.find(x => String(x.id) === String(notificationId));
        if (!n) return;

        document.getElementById("drawer-notifications")?.classList.add("hidden");

        if (!n.read) {
            n.read = true;
            state.unreadNotifications = Math.max(0, state.unreadNotifications - 1);
            renderNotifications();
            api(`/api/notifications/${n.id}/read`, { method: "PUT" })
                .catch(err => console.warn("Could not mark notification read", err));
        }

        if (n.threadId) {
            switchView("view-messages");
            if (state.chats[n.threadId]) openChatThread(n.threadId);
            return;
        }

        if (n.postId) {
            showPostInFeed(n.postId);
            return;
        }

        if (n.actorId) openUserProfile(n.actorId);
    }

    document.getElementById("btn-mark-all-read")?.addEventListener("click", async () => {
        try {
            await api("/api/notifications/read-all", { method: "PUT" });
            state.notifications.forEach(n => { n.read = true; });
            state.unreadNotifications = 0;
            renderNotifications();
        } catch (err) {
            showToast(describeApiError(err, "Could not mark notifications read."), "error");
        }
    });

    /**
     * The people you are connected with, listed on your own profile.
     *
     * A connection row records who asked and who agreed, so it is read in both
     * directions — you are connected whether you sent the request or accepted it.
     */
    async function loadConnections() {
        try {
            state.connections = await api("/api/connections/accepted");
        } catch (err) {
            state.connections = [];
        }
        renderConnections();
    }

    function renderConnections() {
        scheduleProgressRefresh();
        renderFeed();
        const list = document.getElementById("connections-list");
        const count = document.getElementById("connections-count");
        if (!list) return;

        const people = state.connections || [];

        // Both places say "Connections", so both must mean the same thing:
        // people you are actually connected with. Pending rows still appear in
        // the list, labelled, so a sent request can be withdrawn.
        const settled = people.filter(c => c.status !== "PENDING").length;
        if (count) count.textContent = settled;

        const statCount = document.getElementById("stat-connections-count");
        if (statCount) statCount.textContent = settled;

        if (!people.length) {
            list.innerHTML = `
                <div class="connections-empty">
                    No connections yet. Find people on Discover and send a request.
                </div>
            `;
            return;
        }

        list.innerHTML = people.map(c => {
            const pending = c.status === "PENDING";
            // A request you sent can be withdrawn; an accepted one is removed.
            const action = pending ? "Cancel request" : "Disconnect";

            return `
                <div class="connection-row" data-connection-id="${escapeHtml(c.id)}">
                    <div class="creator-avatar tone" ${toneAttrs(c.userId, c.name)}${c.userId ? ` data-user-id="${escapeHtml(c.userId)}"` : ""}>${escapeHtml(c.avatar)}</div>
                    <div class="connection-info"${c.userId ? ` data-user-id="${escapeHtml(c.userId)}"` : ""}>
                        <h4>${escapeHtml(c.name)}${pending ? ` <span class="connection-pending">Pending</span>` : ""}</h4>
                        <p>${escapeHtml(c.niche || "Conexus Creator")}</p>
                    </div>
                    <button class="btn-disconnect" data-connection-id="${escapeHtml(c.id)}" data-confirming="false">${action}</button>
                </div>
            `;
        }).join("");
    }

    // The Connections stat opens the list rather than being a number that does
    // nothing — the tile it replaced showed a hardcoded "12 Collabs Done".
    document.getElementById("stat-connections")?.addEventListener("click", () => {
        switchView("view-connections");
        loadConnections();
    });

    document.getElementById("btn-back-from-connections")?.addEventListener("click", () => {
        switchView("view-profile");   // it is only reachable from there
    });

    // Disconnecting asks once. A single click on a small button is too easy to
    // do by accident for something that cannot be undone.
    document.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-disconnect");
        if (!btn) return;
        e.stopPropagation();

        if (btn.getAttribute("data-confirming") !== "true") {
            btn.setAttribute("data-confirming", "true");
            btn.textContent = "Sure?";
            btn.classList.add("confirming");

            // Revert if they walk away rather than leaving it armed.
            const original = btn.textContent;
            clearTimeout(btn._revert);
            btn._revert = setTimeout(() => {
                btn.setAttribute("data-confirming", "false");
                btn.textContent = original;
                btn.classList.remove("confirming");
            }, 4000);
            return;
        }

        clearTimeout(btn._revert);
        const id = btn.getAttribute("data-connection-id");
        // Withdrawing a request you sent is not the same as ending a connection.
        const wasPending = (state.connections || [])
            .some(c => String(c.id) === String(id) && c.status === "PENDING");
        btn.disabled = true;

        try {
            await api(`/api/connections/${id}`, { method: "DELETE" });
            state.connections = (state.connections || []).filter(c => String(c.id) !== String(id));
            renderConnections();

            // The Discover and Home cards show connection state too.
            await loadDiscover(true);
            loadHomeCreators();
            showToast(wasPending ? "Request withdrawn" : "Disconnected");
        } catch (err) {
            btn.disabled = false;
            btn.setAttribute("data-confirming", "false");
            btn.classList.remove("confirming");
            renderConnections();   // puts the right label back
            showToast(describeApiError(err, "Could not remove that connection."), "error");
        }
    });

    /**
     * Connection requests waiting on this user, shown above the inbox.
     *
     * Connecting used to write a row and change a label, which is why it felt
     * like it did nothing — nobody on the other end ever saw it.
     */
    async function loadConnectionRequests() {
        try {
            state.connectionRequests = await api("/api/connections/requests");
        } catch (err) {
            state.connectionRequests = [];
        }
        renderConnectionRequests();
    }

    function renderConnectionRequests() {
        renderRailRequests();

        const wrap = document.getElementById("connection-requests");
        const list = document.getElementById("connection-requests-list");
        if (!wrap || !list) return;

        const requests = state.connectionRequests || [];
        wrap.classList.toggle("hidden", requests.length === 0);
        if (!requests.length) {
            list.innerHTML = "";   // do not leave stale cards in the hidden section
            return;
        }

        list.innerHTML = requests.map(req => `
            <div class="request-card" data-request-id="${escapeHtml(req.id)}">
                <div class="creator-avatar tone" ${toneAttrs(req.requesterId, req.name)}${req.requesterId ? ` data-user-id="${escapeHtml(req.requesterId)}"` : ""}>${escapeHtml(req.avatar)}</div>
                <div class="request-info">
                    <h4>${escapeHtml(req.name)}</h4>
                    <p>${escapeHtml(req.niche || "Conexus Creator")} wants to connect</p>
                </div>
                <div class="request-actions">
                    <button class="btn-accept-request" data-request-id="${escapeHtml(req.id)}">Accept</button>
                    <button class="btn-decline-request" data-request-id="${escapeHtml(req.id)}">Decline</button>
                </div>
            </div>
        `).join("");
    }

    document.addEventListener("click", async (e) => {
        const accept = e.target.closest(".btn-accept-request");
        const decline = e.target.closest(".btn-decline-request");
        if (!accept && !decline) return;

        const btn = accept || decline;
        const requestId = btn.getAttribute("data-request-id");
        btn.disabled = true;

        try {
            await api(`/api/connections/${requestId}/${accept ? "accept" : "decline"}`, { method: "PUT" });

            if (accept) celebrate(btn);   // burst from the button that was pressed

            state.connectionRequests = state.connectionRequests.filter(x => String(x.id) !== String(requestId));
            renderConnectionRequests();

            // The bar lives in the open conversation; take it away either way.
            if (state.activeThreadId && state.chats[state.activeThreadId]) {
                renderChatRequestBar(state.chats[state.activeThreadId]);
            }

            // Their card on Home and Discover changes either way.
            loadHomeCreators();
            loadDiscover(true);

            if (accept) {
                showToast("Connection accepted");
                loadConnections();
                // The acceptance is written into the conversation, so refresh it.
                try {
                    const threads = await api(`/api/chats`);
                    state.chats = {};
                    threads.forEach(t => { state.chats[t.id] = t; });
                    renderInbox();

                    // The acceptance was written into the thread; show it.
                    if (state.activeThreadId && state.chats[state.activeThreadId]) {
                        renderChatMessages(state.chats[state.activeThreadId].messages || []);
                    }
                } catch (e) {
                    // The connection is accepted either way.
                }
            }
        } catch (err) {
            btn.disabled = false;
            showToast(describeApiError(err, "Could not respond to that request."), "error");
        }
    });

    function renderInbox() {
        if (!inboxList) return;

        // Most recent conversation first. Threads from before timestamps were
        // recorded have none and sink to the bottom.
        const stamp = t => (t && t.updatedAt ? new Date(t.updatedAt).getTime() : 0);
        const threadIds = Object.keys(state.chats)
            .sort((a, b) => stamp(state.chats[b]) - stamp(state.chats[a]));
        if (threadIds.length === 0) {
            inboxList.innerHTML = `
                <div class="empty-card">
                    No conversations yet. Connect with creators on Discover to start chatting.
                </div>
            `;
            return;
        }

        inboxList.innerHTML = threadIds.map(id => {
            const thread = state.chats[id];
            return `
                <div class="chat-thread ${thread.unread ? 'unread' : ''}" data-thread-id="${escapeHtml(id)}">
                    <div class="creator-avatar tone" ${toneAttrs(thread.partnerUserId, thread.name)}>${escapeHtml(thread.avatar)}</div>
                    <div class="thread-info">
                        <div class="thread-top">
                            <h4>${escapeHtml(thread.name)}</h4>
                            <span class="thread-time">${escapeHtml(thread.updatedAt ? timeAgo(thread.updatedAt) : (thread.time || ""))}</span>
                        </div>
                        <p class="thread-snippet">${escapeHtml(thread.snippet || '')}</p>
                    </div>
                    ${thread.unread ? '<span class="unread-dot"></span>' : ''}
                </div>
            `;
        }).join("");

        inboxList.querySelectorAll(".chat-thread").forEach(thread => {
            thread.addEventListener("click", async () => {
                const threadId = thread.getAttribute("data-thread-id");
                if (!threadId) return;

                thread.classList.remove("unread");
                const unreadDot = thread.querySelector(".unread-dot");
                if (unreadDot) unreadDot.remove();

                openChatThread(threadId);

                // Persist the read flag, otherwise the thread showed up unread again
                // on every reload.
                if (state.chats[threadId] && state.chats[threadId].unread) {
                    try {
                        state.chats[threadId] = await api(`/api/chats/${threadId}/read`, { method: "PUT" });
                    } catch (err) {
                        console.warn("Could not mark thread as read", err);
                    }
                }
            });
        });
    }

    function openChatThread(threadId) {
        const threadData = state.chats[threadId] || {
            name: "Creator",
            avatar: "CR",
            bgClass: "avatar-purple",
            status: "Conexus Creator",
            messages: []
        };

        state.activeThreadId = threadId;

        if (chatHeaderAvatar) {
            chatHeaderAvatar.textContent = threadData.avatar;
            chatHeaderAvatar.className = "small-avatar";
            applyTone(chatHeaderAvatar, threadData.partnerUserId, threadData.name);
        }
        if (chatHeaderName) chatHeaderName.textContent = threadData.name;
        if (chatHeaderStatus) chatHeaderStatus.textContent = threadData.status;

        // Tag the header so the shared [data-user-id] handler can open them.
        const chatUserInfo = document.querySelector("#drawer-chat .chat-user-info");
        if (chatUserInfo) {
            if (threadData.partnerUserId) {
                chatUserInfo.setAttribute("data-user-id", threadData.partnerUserId);
                chatUserInfo.classList.add("is-linked");
            } else {
                chatUserInfo.removeAttribute("data-user-id");
                chatUserInfo.classList.remove("is-linked");
            }
        }

        renderChatMessages(threadData.messages || []);
        renderChatRequestBar(threadData);

        if (drawerChat) drawerChat.classList.remove("hidden");
    }

    /**
     * Shows Accept / Decline inside the conversation when this person has a
     * request waiting on you. The request is written into the thread, so the
     * answer belongs there too rather than only in the Messages list.
     */
    function renderChatRequestBar(thread) {
        const bar = document.getElementById("chat-request-bar");
        if (!bar) return;

        const partnerId = thread && thread.partnerUserId;
        const request = partnerId
            ? (state.connectionRequests || []).find(r => String(r.requesterId) === String(partnerId))
            : null;

        bar.classList.toggle("hidden", !request);
        if (!request) return;

        document.getElementById("chat-request-text").textContent =
            `${request.name} wants to connect with you`;

        // The shared accept/decline handler works off this attribute.
        document.getElementById("chat-accept-request").setAttribute("data-request-id", request.id);
        document.getElementById("chat-decline-request").setAttribute("data-request-id", request.id);
    }

    function renderChatMessages(messages) {
        if (!chatMessagesContainer) return;

        chatMessagesContainer.innerHTML = messages.map(msg => {
            // Connection requests and acceptances are notes about the
            // conversation, not messages within it.
            if (msg.system) {
                return `
                    <div class="msg-system">
                        <span>${escapeHtml(msg.text)}</span>
                        <small>${escapeHtml(msg.time)}</small>
                    </div>
                `;
            }
            // Escaped: message text is written by another person.
            return `
                <div class="msg-bubble ${msg.sender === "me" ? "sent" : "received"}">
                    <p>${escapeHtml(msg.text)}</p>
                    <span class="msg-time">${escapeHtml(msg.time)}</span>
                </div>
            `;
        }).join("");

        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    if (btnCloseChat && drawerChat) {
        btnCloseChat.addEventListener("click", () => {
            drawerChat.classList.add("hidden");
            state.activeThreadId = null;
        });
    }

    if (formChatSend) {
        formChatSend.addEventListener("submit", async (e) => {
            e.preventDefault();
            const text = chatInputText ? chatInputText.value.trim() : "";
            if (!text || !state.activeThreadId) return;

            const threadData = state.chats[state.activeThreadId];
            if (!threadData) return;

            const threadId = state.activeThreadId;
            chatInputText.value = "";

            try {
                // Render the thread the server saved, so what is on screen is
                // exactly what will still be there after a reload.
                const savedThread = await api(`/api/chats/${threadId}/messages`, {
                    method: "POST",
                    body: { text, sender: "me" }
                });
                state.chats[threadId] = savedThread;
                renderChatMessages(savedThread.messages || []);
                renderInbox();
            } catch (err) {
                chatInputText.value = text;
                showToast(describeApiError(err, "Could not send your message."), "error");
                return;
            }

            // Demo creators with no Conexus account get a canned reply so the
            // demo still feels alive. Real accounts must not: the recipient gets
            // the message in their own inbox and answers for themselves.
            if (state.chats[threadId]?.partnerUserId) return;

            setTimeout(async () => {
                try {
                    const replied = await api(`/api/chats/${threadId}/messages`, {
                        method: "POST",
                        body: {
                            text: "Sounds awesome! Let's definitely coordinate on this.",
                            sender: "them"
                        }
                    });
                    state.chats[threadId] = replied;
                    if (state.activeThreadId === threadId) {
                        renderChatMessages(replied.messages || []);
                    }
                    renderInbox();
                } catch (err) {
                    console.warn("Could not save the simulated reply", err);
                }
            }, 1000);
        });
    }


    // =========================================================================
    // PROFILE & SOCIAL ACCOUNTS MANAGER
    // =========================================================================

    const socialsContainer = document.getElementById("socials-container");
    const modalAddSocial = document.getElementById("modal-add-social");
    const btnOpenAddSocial = document.getElementById("btn-open-add-social");
    const btnCloseSocialModal = document.getElementById("btn-close-social-modal");
    const btnCancelSocial = document.getElementById("btn-cancel-social");
    const formAddSocial = document.getElementById("form-add-social");

    function renderSocials() {
        renderPulseHero();
        scheduleProgressRefresh();
        if (!socialsContainer) return;

        socialsContainer.innerHTML = channelRowsHtml(state.socials, true)
            || `<div class="empty-card">No channels yet. Add the platforms you post on to show your reach.</div>`;
        const totalEl = document.getElementById("channels-total");
        if (totalEl) totalEl.textContent = channelsSummary(state.socials);


        // index.html has always had #social-modal-title and a hidden
        // #social-edit-id for this, but nothing ever used them.
        socialsContainer.querySelectorAll(".btn-social-edit").forEach(btn => {
            btn.onclick = () => {
                const soc = state.socials.find(x => x.id === btn.getAttribute("data-id"));
                if (!soc) return;

                document.getElementById("social-edit-id").value = soc.id;
                document.getElementById("social-modal-title").textContent = "Edit Social Account";
                document.getElementById("btn-save-social").textContent = "Save Changes";
                document.getElementById("social-platform-select").value = soc.platform;
                document.getElementById("social-handle-input").value = soc.handle || "";
                document.getElementById("social-url-input").value = soc.url || "";
                document.getElementById("social-followers-input").value = soc.followers || "";

                modalAddSocial.classList.remove("hidden");
            };
        });

        socialsContainer.querySelectorAll(".btn-social-delete").forEach(btn => {
            btn.onclick = async () => {
                const id = btn.getAttribute("data-id");
                try {
                    await api(`/api/socials/${id}`, { method: "DELETE" });
                    state.socials = state.socials.filter(s => s.id !== id);
                    renderSocials();
                } catch (err) {
                    // Removing it from the list before the server confirmed made a
                    // failed delete look successful until the next reload.
                    showToast(describeApiError(err, "Could not remove this account."), "error");
                }
            };
        });
    }

    if (btnOpenAddSocial && modalAddSocial) {
        btnOpenAddSocial.addEventListener("click", () => {
            formAddSocial?.reset();
            document.getElementById("social-edit-id").value = "";
            document.getElementById("social-modal-title").textContent = "Add Social Account";
            document.getElementById("btn-save-social").textContent = "Save Social Account";
            modalAddSocial.classList.remove("hidden");
        });

        const closeSocialModal = () => modalAddSocial.classList.add("hidden");
        btnCloseSocialModal?.addEventListener("click", closeSocialModal);
        btnCancelSocial?.addEventListener("click", closeSocialModal);
    }

    if (formAddSocial) {
        formAddSocial.addEventListener("submit", async (e) => {
            e.preventDefault();

            const platform = document.getElementById("social-platform-select").value;
            const handle = document.getElementById("social-handle-input").value.trim();
            const url = document.getElementById("social-url-input").value.trim();
            const followers = document.getElementById("social-followers-input").value.trim();

            const meta = platformMeta[platform] || { name: platform, icon: "globe" };

            if (!state.currentUser) {
                showAuthScreen();
                return;
            }

            // Present means we are editing; blank means the server assigns an id.
            const editingId = document.getElementById("social-edit-id").value.trim();

            const payload = {
                platform: platform,
                name: meta.name,
                handle: handle,
                url: url,
                followers: followers,
                icon: meta.icon,
                class: meta.class
            };
            if (editingId) payload.id = editingId;

            try {
                const saved = await api(`/api/socials`, { method: "POST", body: payload });

                const idx = state.socials.findIndex(x => x.id === saved.id);
                if (idx === -1) state.socials.push(saved);
                else state.socials[idx] = saved;

                renderSocials();
                modalAddSocial.classList.add("hidden");
                showToast(editingId ? "Social link updated" : "Social link added");
            } catch (err) {
                showToast(describeApiError(err, "Could not save this social link."), "error");
            }
        });
    }


    // =========================================================================
    // EDIT PROFILE MODAL
    // =========================================================================

    const modalEditProfile = document.getElementById("modal-edit-profile");
    const btnOpenEditProfile = document.getElementById("btn-open-edit-profile");
    const btnCloseEditProfile = document.getElementById("btn-close-edit-profile");
    const btnCancelEditProfile = document.getElementById("btn-cancel-edit-profile");
    const formEditProfile = document.getElementById("form-edit-profile");

    if (btnOpenEditProfile && modalEditProfile) {
        btnOpenEditProfile.addEventListener("click", () => {
            if (document.getElementById("edit-display-name")) document.getElementById("edit-display-name").value = state.profile.displayName || state.currentUser?.displayName || "";
            if (document.getElementById("edit-handle")) document.getElementById("edit-handle").value = state.profile.handle || "";
            if (document.getElementById("edit-location")) document.getElementById("edit-location").value = state.profile.location || "";
            if (document.getElementById("edit-bio")) document.getElementById("edit-bio").value = state.profile.bio || "";
            modalEditProfile.classList.remove("hidden");
        });

        const closeEditProfile = () => modalEditProfile.classList.add("hidden");
        btnCloseEditProfile?.addEventListener("click", closeEditProfile);
        btnCancelEditProfile?.addEventListener("click", closeEditProfile);
    }

    if (formEditProfile) {
        formEditProfile.addEventListener("submit", async (e) => {
            e.preventDefault();
            const nameVal = document.getElementById("edit-display-name").value.trim();
            const handleVal = document.getElementById("edit-handle").value.trim();
            const locVal = document.getElementById("edit-location").value.trim();
            const bioVal = document.getElementById("edit-bio").value.trim();

            if (!state.currentUser) {
                showAuthScreen();
                return;
            }

            try {
                state.profile = await api(`/api/profile`, {
                    method: "PUT",
                    body: {
                        displayName: nameVal,
                        handle: handleVal,
                        location: locVal,
                        bio: bioVal
                    }
                });

                // Keep the cached session in step with the saved profile.
                state.currentUser.displayName = nameVal;
                localStorage.setItem("conexus_user", JSON.stringify(state.currentUser));

                renderProfileData();
                modalEditProfile.classList.add("hidden");
            } catch (err) {
                showToast(describeApiError(err, "Could not save your profile changes."), "error");
            }
        });
    }


    // =========================================================================
    // CREATE POST MODAL (+)
    // =========================================================================

    const modalCreate = document.getElementById("modal-create");
    const btnCreateFloating = document.getElementById("btn-create-floating");
    const btnOpenCreateAlt = document.querySelectorAll(".btn-open-create");
    const btnCloseCreate = document.getElementById("btn-close-create");
    const btnCancelCreate = document.getElementById("btn-cancel-create");
    const formCreatePost = document.getElementById("form-create-post");
    const inspoFeed = document.getElementById("inspo-feed");

    function openCreateModal() {
        if (!state.currentUser) {
            showAuthScreen();
            return;
        }
        prepareComposer();
        if (modalCreate) modalCreate.classList.remove("hidden");
        document.getElementById("create-post-text")?.focus();
    }

    /** Who is posting, and the topic they usually post about, picked for them. */
    function prepareComposer() {
        const u = state.currentUser;
        const name = (state.profile && state.profile.displayName) || u.displayName || u.username;

        const avatar = document.getElementById("composer-avatar");
        if (avatar) {
            avatar.textContent = initials(name);
            avatar.className = "small-avatar";
            applyTone(avatar, u.id, name);
        }
        const nameEl = document.getElementById("composer-name");
        if (nameEl) nameEl.textContent = name;

        // Preselect the topic that matches their niche, unless they already chose.
        const text = document.getElementById("create-post-text");
        if (text && !text.value) {
            const niche = String(u.niche || "").toLowerCase();
            const match = ["gaming", "travel", "music", "lifestyle"].find(t => niche.includes(t))
                || (niche.includes("food") || niche.includes("fashion") ? "lifestyle" : "tech");
            const radio = document.querySelector(`input[name="create-post-niche"][value^="${match[0].toUpperCase() + match.slice(1)}"]`);
            if (radio) radio.checked = true;
        }
        updateComposer();
    }

    /** Counter, Post button and height follow what has been written. */
    function updateComposer() {
        const text = document.getElementById("create-post-text");
        const count = document.getElementById("composer-count");
        const submit = document.getElementById("btn-submit-post");
        if (!text) return;

        const length = text.value.length;
        if (count) {
            count.textContent = length > 1800 ? `${2000 - length} left` : "";
            count.classList.toggle("warn", length > 1900);
        }
        if (submit && submit.textContent === "Post") {
            submit.disabled = !text.value.trim() && !pendingPhoto;
        }

        text.style.height = "auto";
        text.style.height = `${Math.min(text.scrollHeight, window.innerHeight * 0.4)}px`;
    }

    document.getElementById("create-post-text")?.addEventListener("input", updateComposer);
    function closeCreateModal() {
        if (modalCreate) modalCreate.classList.add("hidden");
    }

    if (btnCreateFloating) btnCreateFloating.addEventListener("click", openCreateModal);
    btnOpenCreateAlt.forEach(btn => btn.addEventListener("click", openCreateModal));
    if (btnCloseCreate) btnCloseCreate.addEventListener("click", closeCreateModal);
    if (btnCancelCreate) btnCancelCreate.addEventListener("click", closeCreateModal);

    /**
     * Renders the Inspo feed from state.posts (loaded from the database).
     * The feed used to be hardcoded markup in index.html, which is why new posts
     * disappeared on reload and comment counts never matched the server.
     */
    function renderFeed() {
        if (!inspoFeed) return;
        document.querySelectorAll(".feed-modes .chip").forEach(c =>
            c.classList.toggle("active", c.getAttribute("data-feed-mode") === feedMode));
        renderFeedPeople();

        const posts = visibleFeedPosts();
        const filterBar = document.getElementById("feed-filter");
        const author = feedAuthorFilter && state.posts.find(p => postAuthorKey(p) === feedAuthorFilter);
        filterBar?.classList.toggle("hidden", !author);
        if (author) document.getElementById("feed-filter-name").textContent = author.authorName;

        if (!posts.length) {
            inspoFeed.innerHTML = feedMode === "friends" && !feedAuthorFilter && state.posts.length
                ? `<div class="empty-card">
                       Nobody you're connected with has posted yet.
                       <button class="feed-empty-action" data-feed-mode="everyone">See posts from everyone</button>
                   </div>`
                : `<div class="empty-card">No posts yet. Use "+ New Post" to share the first one.</div>`;
            return;
        }

        inspoFeed.innerHTML = posts.map(postCardHtml).join("");
        hydratePostImages(inspoFeed);
    }

    // =========================================================================
    // HOME OVERVIEW — reach, this week, the next move, recent activity
    // =========================================================================

    /** "18.2K" → 18200, "1.2M" → 1200000, "950" → 950. */
    function parseCount(text) {
        const m = /^([\d.,]+)\s*([kKmM]?)/.exec(String(text || "").trim());
        if (!m) return 0;
        const n = parseFloat(m[1].replace(/,/g, ""));
        return n * (/k/i.test(m[2]) ? 1e3 : /m/i.test(m[2]) ? 1e6 : 1);
    }

    function formatCount(n) {
        if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
        if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
        return String(Math.round(n));
    }

    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    function renderPulse() {
        renderPulseHero();
        loadProgress();
        loadReach();
        renderPulseNext();
        renderPulseActivity();
    }

    /**
     * Reach is the sum of the follower counts on your linked platforms, shown
     * per platform so the headline number is never unexplained.
     */
    function renderPulseHero() {
        const reachEl = document.getElementById("pulse-reach");
        const labelEl = document.getElementById("pulse-reach-label");
        const chipEl = document.getElementById("pulse-engagement");
        const barsEl = document.getElementById("pulse-platforms");
        if (!reachEl || !barsEl) return;

        const socials = (state.socials || []).map(s => ({ ...s, n: parseCount(s.followers) }));
        const total = socials.reduce((sum, s) => sum + s.n, 0);
        const fallback = (state.profile && state.profile.totalReach) || "0";

        reachEl.textContent = socials.length ? formatCount(total) : fallback;
        labelEl.textContent = socials.length
            ? `Total reach · ${socials.length} platform${socials.length === 1 ? "" : "s"}`
            : "Total reach";

        const engagement = (state.profile && state.profile.engagement) || "";
        chipEl.textContent = engagement && engagement !== "0%" ? `${engagement} avg. engagement` : "";
        chipEl.classList.toggle("hidden", !chipEl.textContent);
        document.getElementById("pulse-graph")?.classList.toggle("hidden", !socials.length);

        if (!socials.length) {
            barsEl.innerHTML = `<button class="pulse-link-platform" id="btn-pulse-add-social">${icon("plus")} Link a platform to track your reach</button>`;
            return;
        }

        // Where the reach comes from, as plain numbers. Four rows at most, so
        // the block stays a summary; the rest are one tap away on the profile.
        const sorted = socials.sort((a, b) => b.n - a.n);
        const shown = sorted.slice(0, 4);
        const hidden = sorted.length - shown.length;
        barsEl.innerHTML = shown
            .map(s => {
                const meta = platformMeta[s.platform] || { name: s.platform, icon: "globe", class: "platform-website" };
                return `<span class="pulse-platform"><span class="pulse-platform-icon ${meta.class}">${icon(meta.icon)}</span>${escapeHtml(meta.name)} <b>${escapeHtml(s.followers || "0")}</b></span>`;
            }).join("")
            + (hidden > 0
                ? `<button class="pulse-platform-more nav-switch-trigger" data-target="view-profile">+ ${hidden} more platform${hidden === 1 ? "" : "s"}</button>`
                : "");
    }

    /**
     * Recent progress: likes, comments, connections and posts in the chosen
     * period, each next to the period before it. Counted on the server from
     * when things actually happened, so nothing here is estimated.
     */
    let progressDays = 30;
    try { progressDays = Number(localStorage.getItem("conexus_progress_days")) || 30; } catch (e) { /* storage off */ }
    let progressData = null;
    let progressTimer = null;

    async function loadProgress() {
        try {
            progressData = await api(`/api/stats/progress?days=${progressDays}`);
        } catch (err) {
            progressData = null;
        }
        renderPulseProgress();
    }

    /** Several things can change at once (a post, then a like); fetch once after. */
    function scheduleProgressRefresh() {
        if (!state.currentUser) return;
        clearTimeout(progressTimer);
        progressTimer = setTimeout(() => { loadProgress(); loadReach(); }, 400);
    }

    // ── Followers over time, beside the big number ─────────────────────────

    let reachData = null;

    async function loadReach() {
        try {
            reachData = await api(`/api/stats/reach?days=${progressDays}`);
        } catch (err) {
            reachData = null;
        }
        renderReachGraph();
    }

    function shortDate(iso) {
        return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }

    /**
     * A small area chart of total followers for the chosen period, with the
     * change written above it. Scaled to its own range so a gain of a few
     * hundred on 24K is still visible; the caption carries the real size.
     */
    function renderReachGraph() {
        const svg = document.getElementById("pulse-graph-svg");
        const caption = document.getElementById("pulse-graph-change");
        const figure = document.getElementById("pulse-graph");
        if (!svg || !caption) return;

        const points = (reachData && reachData.points) || [];
        figure.classList.toggle("hidden", !(state.socials || []).length);

        const dot = document.getElementById("pulse-graph-dot");

        if (points.length < 2) {
            figure.className = "pulse-graph same";
            caption.textContent = "Tracking from today";
            svg.innerHTML = `<line x1="0" y1="40" x2="160" y2="40" class="pulse-graph-flat"/>`;
            if (dot) dot.hidden = true;
            return;
        }

        const W = 160, H = 56, top = 6, bottom = 4;
        const values = points.map(p => p.total);
        const min = Math.min(...values), max = Math.max(...values);
        const span = max - min || 1;
        const xy = points.map((p, i) => [
            (i / (points.length - 1)) * W,
            max === min ? H / 2 : top + (1 - (p.total - min) / span) * (H - top - bottom)
        ]);
        const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        const [ex, ey] = xy[xy.length - 1];

        const change = reachData.change || 0;
        const trend = change > 0 ? "up" : change < 0 ? "down" : "same";
        figure.className = `pulse-graph ${trend}`;
        caption.textContent = change === 0
            ? `No change in ${progressDays} days`
            : `${change > 0 ? "▲" : "▼"} ${formatCount(Math.abs(change))} in ${progressDays} days`;

        svg.setAttribute("aria-label",
            `Followers from ${shortDate(points[0].day)} (${formatCount(points[0].total)}) to ${shortDate(points[points.length - 1].day)} (${formatCount(points[points.length - 1].total)})`);
        svg.innerHTML = `
            <defs>
                <linearGradient id="pulse-graph-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" class="pulse-graph-stop-top"/>
                    <stop offset="1" class="pulse-graph-stop-bottom"/>
                </linearGradient>
            </defs>
            <path d="${line} L${W},${H} L0,${H} Z" fill="url(#pulse-graph-fill)"/>
            <path d="${line}" class="pulse-graph-line"/>`;

        // The chart stretches to its box, which would squash a circle, so the
        // latest point is marked with an element placed over it instead.
        if (dot) {
            dot.hidden = false;
            dot.style.left = `${(ex / W * 100).toFixed(2)}%`;
            dot.style.top = `${(ey / H * 100).toFixed(2)}%`;
        }
    }

    const PROGRESS_ITEMS = [
        { key: "likes", label: "Likes", icon: "heart" },
        { key: "comments", label: "Comments", icon: "comment" },
        { key: "connections", label: "Connections", icon: "user-plus" },
        { key: "posts", label: "Posts", icon: "grid" }
    ];

    function renderPulseProgress() {
        const el = document.getElementById("pulse-progress");
        const note = document.getElementById("pulse-progress-note");
        if (!el) return;

        document.querySelectorAll(".pulse-range button").forEach(b => {
            const on = Number(b.getAttribute("data-range")) === progressDays;
            b.classList.toggle("on", on);
            b.setAttribute("aria-pressed", String(on));
        });

        if (!progressData) {
            el.innerHTML = `<div class="empty-inline">Progress could not be loaded right now.</div>`;
            if (note) note.textContent = "";
            return;
        }

        el.innerHTML = PROGRESS_ITEMS.map(item => {
            const now = progressData.current[item.key] || 0;
            const before = progressData.previous[item.key] || 0;
            const diff = now - before;
            const trend = diff > 0 ? "up" : diff < 0 ? "down" : "same";
            const change = diff > 0 ? `▲ ${diff}` : diff < 0 ? `▼ ${Math.abs(diff)}` : "Same";
            return `
                <div class="pulse-stat" data-tone="${item.key}">
                    <span class="pulse-stat-top">${icon(item.icon)}<b>${now}</b></span>
                    <span class="pulse-stat-label" title="${item.label}">${item.label}</span>
                    <span class="pulse-trend ${trend}" title="${before} in the ${progressData.days} days before">${change}</span>
                </div>`;
        }).join("");

        if (note) note.textContent = `Compared with the ${progressData.days} days before.`;
    }

    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".pulse-range button");
        if (!btn) return;
        progressDays = Number(btn.getAttribute("data-range")) || 30;
        try { localStorage.setItem("conexus_progress_days", String(progressDays)); } catch (err) { /* storage off */ }
        loadProgress();
        loadReach();
    });

    /** Steps skipped from the overview this session; they stay open in Strategy. */
    const skippedSteps = new Set();

    /**
     * One Strategy step at a time. The steps are the same cards the Strategy
     * page shows, so finishing one here ticks it there too.
     */
    function renderPulseNext() {
        const el = document.getElementById("pulse-next");
        if (!el) return;

        const all = [...document.querySelectorAll("#view-recommendations .step-card")];
        const visible = all.map((card, i) => ({ card, key: stepKey(card, i) }))
            .filter(s => !s.card.classList.contains("hidden"));
        const open = visible.filter(s => !s.card.querySelector(".step-checkbox")?.checked);
        const queue = open.filter(s => !skippedSteps.has(s.key));
        const doneCount = visible.length - open.length;

        const dots = visible.map(s => {
            const checked = s.card.querySelector(".step-checkbox")?.checked;
            const current = queue[0] && queue[0].key === s.key;
            return `<i class="${checked ? "done" : current ? "on" : ""}"></i>`;
        }).join("");

        if (!queue.length) {
            const allDone = !open.length;
            el.innerHTML = `
                <span class="pulse-next-label">Next move</span>
                <h3>${allDone ? "You're all caught up" : "You skipped the rest"}</h3>
                <p>${allDone
                    ? `All ${visible.length} Strategy steps are done. New ones arrive as your channels grow.`
                    : `${open.length} step${open.length === 1 ? " is" : "s are"} still open in Strategy.`}</p>
                <div class="pulse-next-row">
                    <button class="pulse-go" data-act="${allDone ? "strategy" : "unskip"}">${allDone ? "Open Strategy" : "Show them again"}</button>
                    <span class="pulse-dots">${dots}</span>
                </div>`;
            return;
        }

        const step = queue[0].card;
        const action = step.querySelector(".btn-step-action");
        const label = action ? action.textContent.replace("→", "").trim() : "Mark done";
        const position = visible.findIndex(s => s.key === queue[0].key) + 1;

        el.setAttribute("data-step-key", queue[0].key);
        el.innerHTML = `
            <span class="pulse-next-label">Next move · ${position} of ${visible.length}${doneCount ? ` · ${doneCount} done` : ""}</span>
            <h3>${escapeHtml(step.querySelector("h4")?.textContent || "")}</h3>
            <p>${escapeHtml(step.querySelector(".step-content > p")?.textContent || "")}</p>
            <div class="pulse-next-row">
                <button class="pulse-go" data-act="do">${escapeHtml(label)}</button>
                <button class="pulse-skip" data-act="skip">Skip</button>
                <span class="pulse-dots">${dots}</span>
            </div>`;
    }

    document.getElementById("pulse-next")?.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.getAttribute("data-act");
        if (!act) return;
        const el = e.currentTarget;

        if (act === "strategy") { switchView("view-recommendations"); return; }
        if (act === "unskip") { skippedSteps.clear(); renderPulseNext(); return; }

        const key = el.getAttribute("data-step-key");
        const all = [...document.querySelectorAll("#view-recommendations .step-card")];
        const card = all.find((c, i) => stepKey(c, i) === key);
        if (!card) return;

        if (act === "skip") {
            skippedSteps.add(key);
            renderPulseNext();
            return;
        }

        // Do it: run the step's own action where it has one, then tick it,
        // which saves it and moves the overview on.
        card.querySelector(".btn-step-action")?.click();
        const box = card.querySelector(".step-checkbox");
        if (box && !box.checked) {
            box.checked = true;
            box.dispatchEvent(new Event("change"));
        }
        showToast("Done — ticked off in Strategy");
    });

    /** The latest few notifications, each opening what it is about. */
    function renderPulseActivity() {
        const el = document.getElementById("pulse-activity");
        if (!el) return;

        const items = (state.notifications || []).slice(0, 3);
        if (!items.length) {
            el.innerHTML = `<div class="empty-inline">Nothing new yet. Likes, comments and requests show up here.</div>`;
            return;
        }

        el.innerHTML = items.map(n => {
            const meta = NOTIFICATION_TEXT[n.type] || { verb: "interacted with you" };
            // A request and its acceptance are both CONNECTION; the excerpt says which.
            const verb = n.type === "CONNECTION" && n.excerpt ? escapeHtml(n.excerpt) : meta.verb;
            return `
                <button class="pulse-item${n.read ? "" : " unread"}" data-notification-id="${escapeHtml(n.id)}">
                    <span class="small-avatar tone" ${toneAttrs(n.actorId, n.actorName)}>${escapeHtml(initials(n.actorName || "?"))}</span>
                    <span class="pulse-item-text"><b>${escapeHtml(n.actorName || "Someone")}</b> ${verb}${n.excerpt && n.type !== "CONNECTION" ? `<small>${escapeHtml(n.excerpt)}</small>` : ""}</span>
                    <time>${escapeHtml(timeAgo(n.createdAt))}</time>
                </button>`;
        }).join("");
    }

    document.getElementById("pulse-activity")?.addEventListener("click", (e) => {
        const item = e.target.closest(".pulse-item");
        if (item) openNotification(item.getAttribute("data-notification-id"));
    });

    document.getElementById("btn-pulse-activity")?.addEventListener("click", (e) => {
        // The page-wide handler closes the drawer on outside clicks; this
        // click is the one that opens it.
        e.stopPropagation();
        document.getElementById("drawer-notifications")?.classList.remove("hidden");
        loadNotifications();
    });

    document.addEventListener("click", (e) => {
        if (e.target.closest("#btn-pulse-add-social")) {
            switchView("view-profile");
            document.getElementById("btn-open-add-social")?.click();
        }
    });

    // ── Who the Home feed shows ────────────────────────────────────────────

    /** "friends" (you and the people you're connected with) or "everyone". */
    let feedMode = readSetting("conexus_feed_mode", ["friends", "everyone"], "friends");
    /** A single author picked from the row of people, or null. */
    let feedAuthorFilter = null;

    /** Accounts you're connected with, in either direction. */
    function friendIds() {
        return new Set((state.connections || [])
            .filter(c => c.status !== "PENDING" && c.userId != null)
            .map(c => String(c.userId)));
    }

    /** Who wrote a post: their account where there is one, else their name. */
    function postAuthorKey(p) {
        return p.authorId != null ? String(p.authorId) : `name:${p.authorName || ""}`;
    }

    function visibleFeedPosts() {
        if (feedAuthorFilter) return state.posts.filter(p => postAuthorKey(p) === feedAuthorFilter);
        if (feedMode === "everyone") return state.posts;

        const friends = friendIds();
        const me = state.currentUser ? String(state.currentUser.id) : "";
        return state.posts.filter(p => String(p.authorId) === me || friends.has(String(p.authorId)));
    }

    /**
     * The row of people above the feed: everyone who has posted, friends
     * first, most recent first. A ring marks a post in the last week; tapping
     * someone narrows the feed to them.
     */
    function renderFeedPeople() {
        const row = document.getElementById("feed-people");
        if (!row) return;

        const me = state.currentUser ? String(state.currentUser.id) : "";
        const friends = friendIds();
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const people = new Map();

        state.posts.forEach(p => {
            const id = postAuthorKey(p);
            if (id === me || people.has(id)) return;   // posts arrive newest first
            people.set(id, {
                id,
                userId: p.authorId,
                name: p.authorName || "Creator",
                friend: friends.has(id),
                fresh: p.createdAt && new Date(p.createdAt).getTime() > weekAgo
            });
        });

        const list = [...people.values()].sort((a, b) => (b.friend - a.friend) || (b.fresh - a.fresh));
        row.classList.toggle("hidden", list.length === 0);
        row.innerHTML = list.map(p => `
            <button class="feed-person${p.fresh ? " fresh" : ""}${feedAuthorFilter === p.id ? " on" : ""}" data-author="${escapeHtml(p.id)}" aria-pressed="${feedAuthorFilter === p.id}">
                <span class="feed-ring"><span class="small-avatar tone" ${toneAttrs(p.userId, p.name)}>${escapeHtml(initials(p.name))}</span></span>
                <span class="feed-person-name">${escapeHtml(p.name.split(" ")[0])}</span>
            </button>
        `).join("");
    }

    document.addEventListener("click", (e) => {
        const modeBtn = e.target.closest("[data-feed-mode]");
        if (modeBtn) {
            feedMode = modeBtn.getAttribute("data-feed-mode");
            feedAuthorFilter = null;
            document.querySelectorAll(".feed-modes .chip").forEach(c =>
                c.classList.toggle("active", c.getAttribute("data-feed-mode") === feedMode));
            renderFeed();
            return;
        }

        const person = e.target.closest(".feed-person");
        if (person) {
            const id = person.getAttribute("data-author");
            feedAuthorFilter = feedAuthorFilter === id ? null : id;
            renderFeed();
            return;
        }

        if (e.target.closest("#btn-clear-feed-filter")) {
            feedAuthorFilter = null;
            renderFeed();
        }
    });

    /**
     * One post, everywhere a post appears — the feed, your profile, someone
     * else's. The profile copies used to be separate markup with inert
     * buttons, so likes and comments only worked in the feed.
     */
    function postCardHtml(post) {
        const author = post.authorName || "Creator";
        const liked = post.liked === true;
        const mine = state.currentUser && String(post.authorId) === String(state.currentUser.id);

        return `
            <article class="inspo-card" data-post-id="${escapeHtml(post.id)}">
                <div class="post-author${post.authorId ? " is-linked" : ""}"${post.authorId ? ` data-user-id="${escapeHtml(post.authorId)}"` : ""}>
                    <div class="small-avatar tone" ${toneAttrs(post.authorId, author)}>${escapeHtml(initials(author))}</div>
                    <div>
                        <strong>${escapeHtml(author)}</strong>
                        <span>${escapeHtml(post.niche || "Creator")} · ${escapeHtml(timeAgo(post.createdAt))}</span>
                    </div>
                </div>
                ${post.content ? `<p class="post-content">${escapeHtml(post.content)}</p>` : ""}
                ${postImageHtml(post)}
                <div class="post-footer">
                    <button class="btn-like ${liked ? "liked" : ""}" data-liked="${liked}" aria-label="Like">
                        ${icon("heart", liked ? "icon-fill" : "")} <span class="like-count">${post.likesCount || 0}</span>
                    </button>
                    <button class="btn-comment" aria-label="Comments">${icon("comment")} <span class="comment-count">${post.commentsCount || 0}</span></button>
                    <button class="btn-share">${icon("share")} Share</button>
                    ${mine ? `<button class="btn-delete btn-delete-post" data-post-id="${escapeHtml(post.id)}">Delete</button>` : ""}
                </div>
            </article>
        `;
    }

    /**
     * The photo on a post. Its box is sized from the stored dimensions, so the
     * feed does not jump as images arrive.
     */
    function postImageHtml(post) {
        const w = Number(post.imageWidth);
        const h = Number(post.imageHeight);
        if (!w || !h) return "";
        return `
            <div class="post-image" style="aspect-ratio:${w} / ${h}">
                <img data-post-image="${escapeHtml(post.id)}" alt="Photo shared by ${escapeHtml(post.authorName || "a creator")}">
            </div>`;
    }

    /**
     * Post photos sit behind sign-in like the rest of the API, and an <img> tag
     * cannot send a bearer token — so each one is fetched with the token and
     * shown from a local object URL, fetched once per session.
     */
    const postImageUrls = new Map();

    function postImageUrl(postId) {
        if (!postImageUrls.has(postId)) {
            const request = fetch(`${API_BASE}/api/posts/${encodeURIComponent(postId)}/image`, {
                headers: { Authorization: `Bearer ${state.currentUser ? state.currentUser.token : ""}` }
            })
                .then(res => {
                    if (!res.ok) throw new Error(`Image ${res.status}`);
                    return res.blob();
                })
                .then(blob => URL.createObjectURL(blob));
            request.catch(() => postImageUrls.delete(postId));   // allow a retry later
            postImageUrls.set(postId, request);
        }
        return postImageUrls.get(postId);
    }

    function hydratePostImages(root) {
        (root || document).querySelectorAll("img[data-post-image]:not([src])").forEach(img => {
            const box = img.closest(".post-image");
            postImageUrl(img.getAttribute("data-post-image"))
                .then(url => {
                    img.src = url;
                    box?.classList.add("loaded");
                })
                .catch(() => box?.classList.add("failed"));
        });
    }

    function forgetPostImages() {
        postImageUrls.forEach(request => request.then(url => URL.revokeObjectURL(url)).catch(() => {}));
        postImageUrls.clear();
    }

    /**
     * A post as a square tile on a profile: the photo when there is one,
     * otherwise the words, set large on the author's colour. Opens the post.
     */
    function postTileHtml(post) {
        const hasImage = post.imageWidth && post.imageHeight;
        const counts = `
            <span class="pf-tile-counts">
                <span>${icon("heart", post.liked ? "icon-fill" : "")} ${post.likesCount || 0}</span>
                <span>${icon("comment")} ${post.commentsCount || 0}</span>
            </span>`;
        return hasImage
            ? `<button class="pf-tile pf-tile-photo" data-post-id="${escapeHtml(post.id)}" aria-label="Open post">
                   <img data-post-image="${escapeHtml(post.id)}" alt="Photo shared by ${escapeHtml(post.authorName || "a creator")}">
                   ${counts}
               </button>`
            : `<button class="pf-tile pf-tile-text" data-post-id="${escapeHtml(post.id)}" ${toneAttrs(post.authorId, post.authorName)} aria-label="Open post">
                   <span class="pf-tile-quote">${escapeHtml(post.content || "")}</span>
                   ${counts}
               </button>`;
    }

    document.addEventListener("click", (e) => {
        const tile = e.target.closest(".pf-tile");
        if (tile) { openPostCommentsModal(tile.getAttribute("data-post-id")); return; }
        if (e.target.closest(".js-open-create")) openCreateModal();
    });

    /** Profile channels: one row per platform, with a bar against the largest. */
    function channelRowsHtml(socials, editable) {
        if (!socials.length) return "";
        const rows = socials.map(s => ({ s, n: parseCount(s.followers) })).sort((a, b) => b.n - a.n);
        const max = Math.max(...rows.map(r => r.n), 1);

        return rows.map(({ s, n }) => {
            const meta = platformMeta[s.platform] || { name: s.platform, icon: "globe", class: "platform-website" };
            return `
                <div class="pf-channel" data-social-id="${escapeHtml(s.id)}">
                    <span class="pf-channel-icon ${meta.class}">${icon(meta.icon)}</span>
                    <div class="pf-channel-body">
                        <div class="pf-channel-top">
                            <span class="pf-channel-name">${escapeHtml(meta.name)} <small>${escapeHtml(s.handle || "")}</small></span>
                            <b>${escapeHtml(s.followers || "0")}</b>
                        </div>
                        <span class="pulse-bar"><i class="${meta.class}" style="width:${Math.max(4, n / max * 100).toFixed(1)}%"></i></span>
                    </div>
                    <div class="social-actions">
                        <a href="${escapeHtml(safeUrl(s.url))}" target="_blank" rel="noopener" class="btn-social-link" title="Open link" aria-label="Open ${escapeHtml(meta.name)}">${icon("link-out")}</a>
                        ${editable ? `
                        <button class="btn-social-edit" data-id="${escapeHtml(s.id)}" title="Edit" aria-label="Edit ${escapeHtml(meta.name)}">${icon("edit")}</button>
                        <button class="btn-social-delete" data-id="${escapeHtml(s.id)}" title="Remove" aria-label="Remove ${escapeHtml(meta.name)}">${icon("x")}</button>` : ""}
                    </div>
                </div>`;
        }).join("");
    }

    function channelsSummary(socials) {
        if (!socials.length) return "";
        const total = socials.reduce((sum, s) => sum + parseCount(s.followers), 0);
        return `${formatCount(total)} followers across ${socials.length} platform${socials.length === 1 ? "" : "s"}`;
    }

    /** "Recent Posts" on the Profile tab — the logged-in user's own posts. */
    function renderUserPosts() {
        const container = document.getElementById("user-posts-container");
        if (!container) return;

        const user = state.currentUser;
        if (!user) {
            container.innerHTML = "";
            return;
        }

        const mine = state.posts.filter(post => String(post.authorId) === String(user.id));

        const countEl = document.getElementById("stat-posts-count");
        if (countEl) countEl.textContent = mine.length;

        container.innerHTML = mine.length
            ? mine.map(postTileHtml).join("")
            : `<div class="empty-card">You haven't posted yet. <button class="pf-empty-action js-open-create">Share your first post</button></div>`;
        hydratePostImages(container);
    }

    /** Posts on someone else's profile page, from the feed we already hold. */
    function renderProfilePosts() {
        const postsEl = document.getElementById("up-posts");
        if (!postsEl || !currentOpenUserId) return;

        const theirs = state.posts.filter(post => String(post.authorId) === String(currentOpenUserId));
        const countEl = document.getElementById("up-posts-count");
        if (countEl) countEl.textContent = theirs.length;

        postsEl.innerHTML = theirs.length
            ? theirs.map(postTileHtml).join("")
            : `<div class="empty-card">No posts yet.</div>`;
        hydratePostImages(postsEl);
    }

    /** Every place a post is drawn, after one of them changes. */
    function renderAllPosts() {
        renderFeed();
        renderUserPosts();
        renderProfilePosts();
        scheduleProgressRefresh();
    }

    // Deleting your own post asks once, the same way other removals do.
    document.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-delete-post");
        if (!btn) return;
        e.stopPropagation();

        if (!armConfirm(btn, "Delete?")) return;

        const postId = btn.getAttribute("data-post-id");
        btn.disabled = true;
        try {
            await api(`/api/posts/${postId}`, { method: "DELETE" });
            state.posts = state.posts.filter(p => String(p.id) !== String(postId));
            renderAllPosts();

            const detail = document.getElementById("post-detail-card");
            if (detail && detail.getAttribute("data-post-id") === String(postId)) {
                modalPostComments?.classList.add("hidden");
            }
            showToast("Post deleted");
        } catch (err) {
            btn.disabled = false;
            showToast(describeApiError(err, "Could not delete that post."), "error");
        }
    });

    /**
     * Two-step confirm for a small destructive button: the first press arms it
     * and relabels it, the second within four seconds goes ahead. Returns true
     * when it is armed and this press should proceed.
     */
    function armConfirm(btn, prompt) {
        if (btn.getAttribute("data-confirming") === "true") {
            clearTimeout(btn._revert);
            return true;
        }
        const original = btn.textContent;
        btn.setAttribute("data-confirming", "true");
        btn.classList.add("confirming");
        btn.textContent = prompt;
        clearTimeout(btn._revert);
        btn._revert = setTimeout(() => {
            btn.setAttribute("data-confirming", "false");
            btn.classList.remove("confirming");
            btn.textContent = original;
        }, 4000);
        return false;
    }

    if (formCreatePost) {
        formCreatePost.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!state.currentUser) {
                showAuthScreen();
                return;
            }
            const text = document.getElementById("create-post-text").value.trim();
            const niche = formCreatePost.querySelector('input[name="create-post-niche"]:checked')?.value || "";

            if (!text && !pendingPhoto) {
                showToast("Write something or add a photo.", "error");
                return;
            }

            const submit = formCreatePost.querySelector("button[type=submit]");
            const label = submit ? submit.textContent : "";
            if (submit) { submit.disabled = true; submit.textContent = "Posting…"; }

            // Save first, then render what came back. The server fills in the
            // author from the session.
            try {
                const body = { niche: niche, content: text };
                if (pendingPhoto) body.image = pendingPhoto.dataUrl;
                const saved = await api("/api/posts", { method: "POST", body });

                state.posts.unshift(saved);
                renderAllPosts();

                formCreatePost.reset();
                setPendingPhoto(null);
                closeCreateModal();
                switchView("view-home");
            } catch (err) {
                showToast(describeApiError(err, "Could not publish your post."), "error");
            } finally {
                if (submit) { submit.textContent = label; }
                updateComposer();
            }
        });
    }

    // ── A photo on a new post ──────────────────────────────────────────────
    // Scaled down to at most 1600px and re-encoded as JPEG in the browser, so
    // a 12 MB phone photo uploads as a few hundred KB and no camera metadata
    // (location included) leaves the device.

    /** The photo waiting to be posted: { dataUrl, width, height }, or null. */
    let pendingPhoto = null;
    const MAX_PHOTO_SIDE = 1600;

    const photoInput = document.getElementById("create-post-image");

    document.getElementById("btn-add-photo")?.addEventListener("click", () => photoInput?.click());
    document.getElementById("btn-remove-photo")?.addEventListener("click", () => setPendingPhoto(null));

    photoInput?.addEventListener("change", async () => {
        const file = photoInput.files && photoInput.files[0];
        photoInput.value = "";   // choosing the same file again should still fire
        if (!file) return;

        try {
            setPendingPhoto(await preparePhoto(file));
        } catch (err) {
            showToast(err.message || "Could not use that photo.", "error");
        }
    });

    function setPendingPhoto(photo) {
        pendingPhoto = photo;
        document.getElementById("create-photo-preview")?.classList.toggle("hidden", !photo);
        document.getElementById("btn-add-photo")?.classList.toggle("hidden", !!photo);
        const img = document.getElementById("create-photo-img");
        if (img) {
            if (photo) img.src = photo.dataUrl;
            else img.removeAttribute("src");
        }
        updateComposer();
    }

    async function preparePhoto(file) {
        if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
        if (file.size > 25 * 1024 * 1024) throw new Error("That photo is over 25 MB.");

        let source;
        try {
            source = await createImageBitmap(file, { imageOrientation: "from-image" });
        } catch (e) {
            source = await loadImageElement(file);
        }

        const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(source.width, source.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(source.width * scale));
        canvas.height = Math.max(1, Math.round(source.height * scale));

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";   // transparent PNGs would otherwise turn black as JPEG
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        if (source.close) source.close();

        return {
            dataUrl: canvas.toDataURL("image/jpeg", 0.85),
            width: canvas.width,
            height: canvas.height
        };
    }

    function loadImageElement(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That photo could not be opened.")); };
            img.src = url;
        });
    }


    // =========================================================================
    // DISCOVER TABS — creators, jobs, brand deals
    // =========================================================================

    let discoverPane = "creators";
    const paneLoaded = { creators: false, jobs: false, deals: false };

    /**
     * Shows one pane of Discover. Each pane fetches on first view rather than
     * all three up front, so opening Discover costs one request.
     */
    function showDiscoverPane(pane) {
        discoverPane = pane;

        document.querySelectorAll(".discover-pane").forEach(p => {
            p.classList.toggle("hidden", p.id !== `pane-${pane}`);
        });
        document.querySelectorAll("#discover-tabs .discover-tab").forEach(t => {
            const on = t.getAttribute("data-pane") === pane;
            t.classList.toggle("active", on);
            t.setAttribute("aria-selected", String(on));
        });

        moveDiscoverUnderline();

        if (pane === "jobs" && !paneLoaded.jobs) { paneLoaded.jobs = true; loadAllJobs(); }
        if (pane === "deals" && !paneLoaded.deals) { paneLoaded.deals = true; loadAllDeals(); }
    }

    /** Slides a tab bar's underline to its active tab, measured from the tab itself. */
    function moveTabUnderline(barId, lineId) {
        const bar = document.getElementById(barId);
        const line = document.getElementById(lineId);
        const active = bar?.querySelector(".discover-tab.active");
        if (!bar || !line || !active) return;

        const barRect = bar.getBoundingClientRect();
        const tabRect = active.getBoundingClientRect();
        if (tabRect.width === 0) return;   // laid out but not visible yet

        line.style.width = `${tabRect.width}px`;
        line.style.transform = `translateX(${tabRect.left - barRect.left}px)`;
    }

    const moveDiscoverUnderline = () => moveTabUnderline("discover-tabs", "discover-tab-underline");
    const moveHomeUnderline = () => moveTabUnderline("home-tabs", "home-tab-underline");

    document.querySelectorAll("#discover-tabs .discover-tab").forEach(tab => {
        tab.addEventListener("click", () => showDiscoverPane(tab.getAttribute("data-pane")));
    });

    /** Home has two panes: the overview and the feed. */
    function showHomePane(pane) {
        document.querySelectorAll("#view-home .home-pane").forEach(p => {
            p.classList.toggle("hidden", p.id !== `home-pane-${pane}`);
        });
        document.querySelectorAll("#home-tabs .discover-tab").forEach(t => {
            const on = t.getAttribute("data-pane") === pane;
            t.classList.toggle("active", on);
            t.setAttribute("aria-selected", String(on));
        });
        moveHomeUnderline();
    }

    document.querySelectorAll("#home-tabs .discover-tab").forEach(tab => {
        tab.addEventListener("click", () => showHomePane(tab.getAttribute("data-pane")));
    });

    window.addEventListener("resize", () => { moveDiscoverUnderline(); moveHomeUnderline(); });

    /** Opens Discover on a particular pane — used by the home "See all" links. */
    function openDiscover(pane) {
        switchView("view-discover");
        showDiscoverPane(pane || "creators");
    }

    // =========================================================================
    // JOBS
    // =========================================================================

    /**
     * A job card. Your own listings render compact — you posted them, so the
     * useful thing is how many people applied, not the details you wrote.
     */
    function jobCardHtml(j) {
        if (j.mine) {
            const count = j.applicationCount || 0;
            return `
                <div class="job-card job-card-mine" data-job-id="${escapeHtml(j.id)}">
                    <div class="job-mine-top">
                        <div class="job-mine-title">
                            <span class="job-mine-label">Your listing</span>
                            <h4>${escapeHtml(j.title)}</h4>
                        </div>
                        <button class="btn-remove-job" data-job-id="${escapeHtml(j.id)}" data-confirming="false">Remove</button>
                    </div>
                    <button class="btn-view-applicants" data-job-id="${escapeHtml(j.id)}" data-title="${escapeHtml(j.title)}">
                        ${count} applicant${count === 1 ? "" : "s"} ${count ? "→" : ""}
                    </button>
                </div>
            `;
        }

        const applied = j.applied === true;
        return `
            <div class="job-card" data-job-id="${escapeHtml(j.id)}">
                <div class="brand-header">
                    <div class="brand-logo ${escapeHtml(j.logoClass || "logo-tech")}">${escapeHtml(j.logo || "?")}</div>
                    <div>
                        <h4>${escapeHtml(j.title)}</h4>
                        <span>${escapeHtml(j.company || "")}</span>
                    </div>
                </div>
                <div class="job-tags">
                    <span class="deal-type-tag">${escapeHtml(j.jobType)}</span>
                    ${j.remote ? `<span class="job-remote-tag">Remote</span>` : ""}
                    ${j.postedByUserId ? `<span class="job-creator-tag">Creator request</span>` : ""}
                </div>
                <p class="brand-desc">${escapeHtml(j.description || "")}</p>
                <div class="brand-footer">
                    <span class="brand-pay">${escapeHtml(j.pay || "")}</span>
                    <button class="btn-apply-job ${applied ? "applied" : ""}" data-job-id="${escapeHtml(j.id)}" data-applied="${applied}">
                        ${applied ? "Applied ✓" : "Apply"}
                    </button>
                </div>
                <span class="job-meta">${escapeHtml(plainLocation(j.location))} · ${escapeHtml(j.createdAt ? postedLabel(j.createdAt) : (j.postedAgo || ""))}</span>
            </div>
        `;
    }

    async function loadHomeJobs() {
        const grid = document.getElementById("home-jobs-grid");
        if (!grid) return;
        try {
            const data = await api("/api/jobs?size=2");
            grid.innerHTML = (data.items || []).length
                ? data.items.map(jobCardHtml).join("")
                : `<div class="empty-card">No open roles right now.</div>`;
        } catch (err) {
            grid.innerHTML = `<div class="empty-card">Could not load jobs.</div>`;
        }
    }

    let jobsType = "all";
    let jobsRemoteOnly = false;
    let jobsSearchTimer = null;

    async function loadAllJobs() {
        const grid = document.getElementById("all-jobs-grid");
        if (!grid) return;

        const input = document.getElementById("jobs-search-input");
        const params = new URLSearchParams({ size: 50 });
        if (jobsType !== "all") params.set("type", jobsType);
        if (jobsRemoteOnly) params.set("remote", "true");
        if (input && input.value.trim()) params.set("search", input.value.trim());

        try {
            const data = await api(`/api/jobs?${params.toString()}`);
            const countEl = document.getElementById("jobs-count");
            if (countEl) countEl.textContent = data.total || 0;

            renderJobTypeChips(data.types || []);

            grid.innerHTML = (data.items || []).length
                ? data.items.map(jobCardHtml).join("")
                : `<div class="empty-card">
                       No roles match that filter.
                   </div>`;
        } catch (err) {
            showToast(describeApiError(err, "Could not load jobs."), "error");
        }
    }

    /** Chips built from the job types present, plus a remote toggle. */
    function renderJobTypeChips(types) {
        const wrap = document.getElementById("jobs-filter-chips");
        if (!wrap || wrap.getAttribute("data-built") === "true") return;

        wrap.innerHTML = [`<button class="chip active" data-type="all">All Roles</button>`]
            .concat(types.map(t => `<button class="chip" data-type="${escapeHtml(t)}">${escapeHtml(t)}</button>`))
            .concat([`<button class="chip chip-remote" data-remote="true">Remote only</button>`])
            .join("");
        wrap.setAttribute("data-built", "true");

        wrap.querySelectorAll(".chip").forEach(chip => {
            chip.addEventListener("click", () => {
                if (chip.hasAttribute("data-remote")) {
                    jobsRemoteOnly = !jobsRemoteOnly;
                    chip.classList.toggle("active", jobsRemoteOnly);
                } else {
                    jobsType = chip.getAttribute("data-type") || "all";
                    wrap.querySelectorAll(".chip:not(.chip-remote)").forEach(c => c.classList.remove("active"));
                    chip.classList.add("active");
                }
                loadAllJobs();
            });
        });
    }

    document.getElementById("btn-see-all-jobs")?.addEventListener("click", () => openDiscover("jobs"));

    document.getElementById("jobs-search-input")?.addEventListener("input", () => {
        clearTimeout(jobsSearchTimer);
        jobsSearchTimer = setTimeout(loadAllJobs, 250);
    });


    // ── Applying, and seeing who applied ───────────────────────────────────

    document.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-apply-job");
        if (!btn) return;
        e.stopPropagation();
        if (!state.currentUser) { showAuthScreen(); return; }

        const jobId = btn.getAttribute("data-job-id");
        const applied = btn.getAttribute("data-applied") === "true";
        btn.disabled = true;

        try {
            if (applied) {
                await api(`/api/jobs/${jobId}/apply`, { method: "DELETE" });
                showToast("Application withdrawn");
            } else {
                await api(`/api/jobs/${jobId}/apply`, { method: "POST", body: {} });
                showToast("Applied — they'll see it in their notifications");
            }
            await loadAllJobs();
            loadHomeJobs();
            loadRailJobs();
        } catch (err) {
            btn.disabled = false;
            showToast(describeApiError(err, "Could not send your application."), "error");
        }
    });

    document.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-view-applicants");
        if (!btn) return;
        e.stopPropagation();

        const jobId = btn.getAttribute("data-job-id");
        const list = document.getElementById("applicants-list");
        const titleEl = document.getElementById("applicants-job-title");
        if (titleEl) titleEl.textContent = btn.getAttribute("data-title") || "";

        document.getElementById("modal-applicants")?.classList.remove("hidden");
        if (list) list.innerHTML = `<div class="applicants-empty">Loading…</div>`;

        try {
            const data = await api(`/api/jobs/${jobId}/applications`);
            list.innerHTML = (data.items || []).length
                ? data.items.map(a => `
                    <div class="applicant-row">
                        <div class="creator-avatar tone" ${toneAttrs(a.userId, a.name)} data-user-id="${escapeHtml(a.userId)}">${escapeHtml(a.avatar)}</div>
                        <div class="applicant-info" data-user-id="${escapeHtml(a.userId)}">
                            <h4>${escapeHtml(a.name)}</h4>
                            <p>${escapeHtml(a.niche || "Conexus Creator")}</p>
                        </div>
                    </div>
                `).join("")
                : `<div class="applicants-empty">Nobody has applied yet.</div>`;
        } catch (err) {
            list.innerHTML = `<div class="applicants-empty">Could not load applicants.</div>`;
        }
    });

    document.getElementById("btn-close-applicants")?.addEventListener("click", () => {
        document.getElementById("modal-applicants")?.classList.add("hidden");
    });

    // ── A creator posting what they are looking for ────────────────────────

    const modalPostJob = document.getElementById("modal-post-job");

    document.getElementById("btn-post-job")?.addEventListener("click", () => {
        if (!state.currentUser) { showAuthScreen(); return; }
        document.getElementById("form-post-job")?.reset();
        modalPostJob?.classList.remove("hidden");
    });

    document.getElementById("btn-close-post-job")?.addEventListener("click", () => modalPostJob?.classList.add("hidden"));
    document.getElementById("btn-cancel-post-job")?.addEventListener("click", () => modalPostJob?.classList.add("hidden"));

    document.getElementById("form-post-job")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!state.currentUser) { showAuthScreen(); return; }

        const title = document.getElementById("job-title-input").value.trim();
        if (!title) return;

        try {
            await api("/api/jobs", {
                method: "POST",
                body: {
                    title: title,
                    jobType: document.getElementById("job-type-select").value,
                    description: document.getElementById("job-desc-input").value.trim(),
                    pay: document.getElementById("job-pay-input").value.trim(),
                    remote: document.getElementById("job-remote-input").checked
                }
            });

            modalPostJob?.classList.add("hidden");
            showToast("Request posted");

            // Show it straight away rather than making them go looking.
            openDiscover("jobs");
            await loadAllJobs();
            loadHomeJobs();
            loadRailJobs();
        } catch (err) {
            showToast(describeApiError(err, "Could not post your request."), "error");
        }
    });

    // Removing your own listing, from the card itself.
    document.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-remove-job");
        if (!btn) return;
        e.stopPropagation();

        if (btn.getAttribute("data-confirming") !== "true") {
            btn.setAttribute("data-confirming", "true");
            btn.textContent = "Remove?";
            clearTimeout(btn._revert);
            btn._revert = setTimeout(() => {
                btn.setAttribute("data-confirming", "false");
                btn.textContent = "Remove";
            }, 4000);
            return;
        }

        clearTimeout(btn._revert);
        btn.disabled = true;
        try {
            await api(`/api/jobs/${btn.getAttribute("data-job-id")}`, { method: "DELETE" });
            await loadAllJobs();
            loadHomeJobs();
            loadRailJobs();
            showToast("Listing removed");
        } catch (err) {
            btn.disabled = false;
            btn.setAttribute("data-confirming", "false");
            btn.textContent = "Remove";
            showToast(describeApiError(err, "Could not remove that listing."), "error");
        }
    });


    // =========================================================================
    // SETTINGS — appearance, home screen, account
    // =========================================================================

    /** Reads a per-device setting, falling back when unset, unknown or unavailable. */
    function readSetting(key, allowed, fallback) {
        try {
            const value = localStorage.getItem(key);
            return allowed.includes(value) ? value : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeSetting(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* storage off */ }
    }

    /** Marks the current choice in each of the Home settings. */
    function renderHomeSettings() {
        const current = {
            "home-tab": readSetting("conexus_home_tab", ["overview", "feed"], "overview"),
            "progress-days": String(progressDays),
            "feed-mode": readSetting("conexus_feed_mode", ["friends", "everyone"], "friends")
        };
        document.querySelectorAll(".settings-segment").forEach(group => {
            const value = current[group.getAttribute("data-setting")];
            group.querySelectorAll("button").forEach(b => {
                const on = b.getAttribute("data-value") === value;
                b.classList.toggle("on", on);
                b.setAttribute("aria-pressed", String(on));
            });
        });
    }

    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".settings-segment button");
        if (!btn) return;
        const setting = btn.closest(".settings-segment").getAttribute("data-setting");
        const value = btn.getAttribute("data-value");

        if (setting === "home-tab") {
            writeSetting("conexus_home_tab", value);
        } else if (setting === "progress-days") {
            progressDays = Number(value);
            writeSetting("conexus_progress_days", value);
            loadProgress();
            loadReach();
        } else if (setting === "feed-mode") {
            writeSetting("conexus_feed_mode", value);
            feedMode = value;
            feedAuthorFilter = null;
            document.querySelectorAll(".feed-modes .chip").forEach(c =>
                c.classList.toggle("active", c.getAttribute("data-feed-mode") === feedMode));
            renderFeed();
        }
        renderHomeSettings();
        showToast("Saved");
    });

    /** Optional sections under the Home overview. */
    const SECTION_LABELS = {
        mingle: { name: "Mingle", hint: "Creators you might click with" },
        jobs:   { name: "Jobs", hint: "Paid roles for creators" },
        deals:  { name: "Brand Deals", hint: "Open campaigns" }
    };

    async function loadPreferences() {
        try {
            state.preferences = await api("/api/preferences");
        } catch (err) {
            state.preferences = { homeSections: ["mingle"], theme: "dark",
                                  available: Object.keys(SECTION_LABELS), maxSections: 3 };
        }
        applyTheme(state.preferences.theme);
        applyHomeSections();
        renderSectionPicker();
    }

    /** Shows only the chosen sections, in the order they were chosen. */
    function applyHomeSections() {
        const chosen = state.preferences?.homeSections || [];
        const home = document.getElementById("home-pane-overview");
        if (!home) return;

        document.querySelectorAll("#view-home .home-section").forEach(sec => {
            sec.classList.toggle("hidden", !chosen.includes(sec.getAttribute("data-section")));
        });

        // Re-append in the chosen order so reordering is possible later.
        chosen.forEach(name => {
            const sec = home.querySelector(`.home-section[data-section="${name}"]`);
            if (sec) home.appendChild(sec);
        });

        // Only fetch what is actually on screen.
        if (chosen.includes("jobs")) loadHomeJobs();
        if (chosen.includes("deals")) loadHomeDeals();
    }

    function renderSectionPicker() {
        const picker = document.getElementById("section-picker");
        if (!picker || !state.preferences) return;

        const chosen = state.preferences.homeSections || [];
        const max = state.preferences.maxSections || 3;

        picker.innerHTML = (state.preferences.available || []).map(name => {
            const meta = SECTION_LABELS[name] || { name: name, hint: "" };
            const on = chosen.includes(name);
            // A section you have not chosen is unavailable once you are at the cap.
            const atCap = !on && chosen.length >= max;

            return `
                <label class="section-option ${on ? "on" : ""} ${atCap ? "disabled" : ""}">
                    <input type="checkbox" data-section="${escapeHtml(name)}" ${on ? "checked" : ""} ${atCap ? "disabled" : ""}>
                    <span class="section-option-text">
                        <strong>${escapeHtml(meta.name)}</strong>
                        <small>${escapeHtml(meta.hint)}</small>
                    </span>
                </label>
            `;
        }).join("");

        const remaining = Math.max(0, max - chosen.length);


        picker.querySelectorAll("input[type=checkbox]").forEach(box => {
            box.addEventListener("change", () => saveSections(box));
        });
    }

    async function saveSections(changedBox) {
        const picked = [...document.querySelectorAll("#section-picker input:checked")]
            .map(b => b.getAttribute("data-section"));

        try {
            state.preferences = await api("/api/preferences", { method: "PUT", body: { homeSections: picked } });
            applyHomeSections();
            renderSectionPicker();
        } catch (err) {
            showToast(describeApiError(err, "Could not save your home screen."), "error");
            renderSectionPicker();
        }
    }

    function applyTheme(theme) {
        const light = theme === "light";
        document.body.classList.toggle("light-theme", light);

        const toggle = document.getElementById("toggle-theme");
        if (toggle) {
            // The switch reads "Dark mode", so it is on when the theme is dark.
            toggle.setAttribute("aria-checked", String(!light));
            toggle.classList.toggle("on", !light);
        }
    }

    document.getElementById("toggle-theme")?.addEventListener("click", async () => {
        const nowLight = !document.body.classList.contains("light-theme");
        applyTheme(nowLight ? "light" : "dark");

        try {
            state.preferences = await api("/api/preferences", {
                method: "PUT",
                body: { theme: nowLight ? "light" : "dark" }
            });
        } catch (err) {
            applyTheme(nowLight ? "dark" : "light");   // put it back
            showToast(describeApiError(err, "Could not save your theme."), "error");
        }
    });

    document.getElementById("btn-open-settings")?.addEventListener("click", () => {
        switchView("view-settings");

        const u = state.currentUser || {};
        const nameEl = document.getElementById("settings-username");
        const mailEl = document.getElementById("settings-email");
        if (nameEl) nameEl.textContent = "@" + (u.username || "");
        if (mailEl) mailEl.textContent = u.email || "";

        renderSectionPicker();
        renderHomeSettings();
    });

    document.getElementById("btn-back-from-settings")?.addEventListener("click", () => {
        switchView("view-profile");
    });

    document.getElementById("btn-settings-edit-profile")?.addEventListener("click", () => {
        switchView("view-profile");
        document.getElementById("btn-open-edit-profile")?.click();
    });

    // =========================================================================
    // BRAND DEALS
    // =========================================================================

    /** One campaign card, used by the recommended strip and the full page. */
    function brandDealHtml(d) {
        return `
            <div class="brand-card" data-deal-id="${escapeHtml(d.id)}">
                <div class="brand-header">
                    <div class="brand-logo ${escapeHtml(d.logoClass || "logo-tech")}">${escapeHtml(d.logo || "?")}</div>
                    <div>
                        <h4>${escapeHtml(d.brandName)}</h4>
                        <span>${escapeHtml(d.industry || "")}</span>
                    </div>
                </div>
                <span class="deal-type-tag">${escapeHtml(d.dealType)}</span>
                <p class="brand-desc">${escapeHtml(d.description || "")}</p>
                <div class="brand-footer">
                    <span class="brand-pay">${escapeHtml(d.pay || "")}</span>
                    <button class="btn-apply-brand">Apply Now</button>
                </div>
            </div>
        `;
    }

    /** The handful shown on the Strategy page. */
    /** The couple shown in the home Brand Deals section. */
    async function loadHomeDeals() {
        const grid = document.getElementById("home-deals-grid");
        if (!grid) return;
        try {
            const data = await api("/api/brand-deals?size=2");
            grid.innerHTML = (data.items || []).length
                ? data.items.map(brandDealHtml).join("")
                : `<div class="empty-card">No open campaigns right now.</div>`;
        } catch (err) {
            grid.innerHTML = `<div class="empty-card">Could not load brand matches.</div>`;
        }
    }

    async function loadRecommendedDeals() {
        const grid = document.getElementById("recommended-deals-grid");
        if (!grid) return;

        try {
            const data = await api("/api/brand-deals?size=2");
            grid.innerHTML = (data.items || []).length
                ? data.items.map(brandDealHtml).join("")
                : `<div class="empty-card">No open campaigns right now.</div>`;
        } catch (err) {
            grid.innerHTML = `<div class="empty-card">Could not load brand matches.</div>`;
        }
    }

    let dealsType = "all";
    let dealsSearchTimer = null;

    /** Every open campaign, filtered by type and search. */
    async function loadAllDeals() {
        const grid = document.getElementById("all-deals-grid");
        const countEl = document.getElementById("deals-count");
        if (!grid) return;

        const input = document.getElementById("deals-search-input");
        const params = new URLSearchParams({ size: 50 });
        if (dealsType !== "all") params.set("type", dealsType);
        if (input && input.value.trim()) params.set("search", input.value.trim());

        try {
            const data = await api(`/api/brand-deals?${params.toString()}`);

            if (countEl) countEl.textContent = data.total || 0;
            renderDealTypeChips(data.types || []);

            grid.innerHTML = (data.items || []).length
                ? data.items.map(brandDealHtml).join("")
                : `<div class="empty-card">
                       No campaigns match that filter.
                   </div>`;
        } catch (err) {
            showToast(describeApiError(err, "Could not load brand deals."), "error");
        }
    }

    /**
     * Builds the filter chips from the deal types that actually exist, so the
     * filters cannot drift out of step with the data.
     */
    function renderDealTypeChips(types) {
        const wrap = document.getElementById("deals-filter-chips");
        if (!wrap || wrap.getAttribute("data-built") === "true") {
            // Only the active state changes after the first build.
            wrap?.querySelectorAll(".chip").forEach(chip => {
                chip.classList.toggle("active", chip.getAttribute("data-type") === dealsType);
            });
            return;
        }

        wrap.innerHTML = [`<button class="chip active" data-type="all">All Deals</button>`]
            .concat(types.map(t => `<button class="chip" data-type="${escapeHtml(t)}">${escapeHtml(t)}</button>`))
            .join("");
        wrap.setAttribute("data-built", "true");

        wrap.querySelectorAll(".chip").forEach(chip => {
            chip.addEventListener("click", () => {
                dealsType = chip.getAttribute("data-type") || "all";
                wrap.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                loadAllDeals();
            });
        });
    }

    // Home and Strategy both have one.
    document.querySelectorAll(".btn-see-all-deals").forEach(btn =>
        btn.addEventListener("click", () => openDiscover("deals")));

    document.getElementById("deals-search-input")?.addEventListener("input", () => {
        clearTimeout(dealsSearchTimer);
        dealsSearchTimer = setTimeout(loadAllDeals, 250);
    });

    // =========================================================================
    // AI OUTREACH MODAL
    // =========================================================================

    const modalOutreach = document.getElementById("modal-outreach");
    const btnCloseOutreach = document.getElementById("btn-close-outreach");
    const outreachTargetCreator = document.getElementById("outreach-target-creator");
    const outreachTextBox = document.getElementById("outreach-text-box");
    const btnCopyOutreach = document.getElementById("btn-copy-outreach");
    const btnSendOutreachChat = document.getElementById("btn-send-outreach-chat");

    /** Who the open pitch is for, when they have an account to message. */
    let outreachUserId = null;

    function openOutreach(targetName, text, userId) {
        outreachUserId = userId || null;
        if (outreachTargetCreator) outreachTargetCreator.textContent = targetName;
        if (outreachTextBox) outreachTextBox.textContent = text;
        // Brands in the catalog have no inbox; offering "Send" would only open
        // some unrelated conversation.
        if (btnSendOutreachChat) btnSendOutreachChat.classList.toggle("hidden", !outreachUserId);
        modalOutreach?.classList.remove("hidden");
    }

    // "Apply Now" on a brand card drafts a pitch to that brand.
    document.addEventListener("click", (e) => {
        const applyBtn = e.target.closest(".btn-apply-brand");
        if (!applyBtn) return;

        const brandName = applyBtn.closest(".brand-card")?.querySelector("h4")?.textContent?.trim()
            || "this brand";

        openOutreach(brandName,
            `Hi ${brandName} team! I'd love to be considered for this campaign. My audience overlaps closely with the one you're targeting, and I can put together a hands-on review that fits your brief. Happy to share my full media kit.`,
            null);
    });

    document.querySelectorAll(".btn-open-outreach").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.getAttribute("data-creator") || "there";
            openOutreach(target,
                `Hey ${target.split(" ")[0]}! Loved your recent content. Based on our audience overlap, I think a joint video or dual stream would work really well for both our channels. Would you be up for a chat?`,
                btn.getAttribute("data-user-id"));
        });
    });

    if (btnCloseOutreach && modalOutreach) {
        btnCloseOutreach.addEventListener("click", () => modalOutreach.classList.add("hidden"));
    }

    if (btnCopyOutreach) {
        btnCopyOutreach.addEventListener("click", async () => {
            if (outreachTextBox) {
                const ok = await copyToClipboard(outreachTextBox.textContent);
                btnCopyOutreach.textContent = ok ? "Copied! ✓" : "Press Ctrl+C";
                setTimeout(() => { btnCopyOutreach.textContent = "Copy Text"; }, 2000);
            }
        });
    }

    // Opens the conversation with that person, pitch in the box ready to
    // edit — it is a draft, so it is not sent on their behalf.
    btnSendOutreachChat?.addEventListener("click", async () => {
        if (!outreachUserId) return;
        try {
            const thread = await api(`/api/chats/with-user?otherUserId=${encodeURIComponent(outreachUserId)}`,
                                     { method: "POST" });
            state.chats[thread.id] = thread;
            modalOutreach?.classList.add("hidden");
            renderInbox();
            switchView("view-messages");
            openChatThread(thread.id);
            if (chatInputText) {
                chatInputText.value = outreachTextBox ? outreachTextBox.textContent : "";
                chatInputText.focus();
            }
        } catch (err) {
            showToast(describeApiError(err, "Could not open that conversation."), "error");
        }
    });


    // =========================================================================
    // CREATOR PROFILE MODAL LOGIC
    // =========================================================================


    let currentOpenCreator = null;
    let currentOpenUserId = null;

    /**
     * Opens a real account's profile as a full view.
     *
     * This used to reuse the creator modal, which meant opening a profile from
     * inside the post modal stacked one overlay behind another — the profile
     * only appeared once you closed the post.
     */
    async function openUserProfile(userId) {
        if (!userId || !state.currentUser) return;

        // Any overlay we were opened from must go, or it covers the view.
        document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(m => m.classList.add("hidden"));
        document.getElementById("drawer-chat")?.classList.add("hidden");
        document.getElementById("drawer-notifications")?.classList.add("hidden");

        if (String(userId) === String(state.currentUser.id)) {
            switchView("view-profile");   // your own profile is its own tab
            return;
        }

        let profile;
        try {
            profile = await api(`/api/users/${userId}`);
        } catch (err) {
            showToast(describeApiError(err, "Could not open that profile."), "error");
            return;
        }

        renderProfileView(profile);
    }

    /**
     * Fills the profile view. Takes the shape returned by /api/users/{id}; a
     * discover card with no account behind it is adapted to the same shape by
     * openCreatorProfile, so both open a page rather than one opening a popup.
     */
    function renderProfileView(profile) {
        currentOpenUserId = profile.id || null;
        currentOpenCreator = profile.creatorId
            ? state.creators.find(c => c.id === profile.creatorId) || null
            : null;

        const name = profile.displayName || profile.username;
        const set = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        const avatarEl = document.getElementById("up-avatar");
        if (avatarEl) {
            avatarEl.textContent = profile.avatar || initials(name);
            avatarEl.className = "creator-avatar pf-avatar";
            applyTone(avatarEl, profile.id, name);
        }

        set("up-display-name", name);
        set("up-handle", profile.handle || ("@" + profile.username));
        set("up-bio", profile.bio || "This creator hasn't written a bio yet.");
        set("up-location", profile.location || "Worldwide");
        set("up-niche", profile.niche || "Creator");
        set("up-reach", profile.totalReach || "0");
        set("up-engagement", profile.engagement || "0%");
        set("up-match", currentOpenCreator ? `${currentOpenCreator.match}%` : "—");

        // Their linked accounts, laid out like the ones on your own profile.
        const socialsEl = document.getElementById("up-socials");
        if (socialsEl) {
            socialsEl.innerHTML = channelRowsHtml(profile.socials || [], false)
                || `<div class="empty-card">No channels linked yet.</div>`;
        }
        set("up-channels-total", channelsSummary(profile.socials || []));
        document.getElementById("up-cover")?.style.setProperty("--hue", hueFor(profile.id, name));

        const postsEl = document.getElementById("up-posts");
        if (postsEl && !profile.id) {
            postsEl.innerHTML = `<div class="empty-card">No posts yet.</div>`;
        }
        renderProfilePosts();

        // Connect works for anyone with an account, whether or not they have a
        // discover card — a connection can be keyed by either.
        const connectBtn = document.getElementById("up-btn-connect");
        if (connectBtn) {
            const canConnect = !!(profile.id || profile.creatorId);
            connectBtn.style.display = canConnect ? "" : "none";
            setProfileConnectButton(connectBtn,
                profile.connected ? (profile.connectionStatus || "ACCEPTED") : null);
            connectBtn.setAttribute("data-creator-id", profile.creatorId || "");
            connectBtn.setAttribute("data-owner-id", profile.id || "");
        }

        // Messaging needs an account on the other end.
        const messageBtn = document.getElementById("up-btn-message");
        if (messageBtn) messageBtn.style.display = profile.id ? "" : "none";

        switchView("view-user-profile");
    }

    /** The profile page's Connect button, for a status of null / PENDING / INCOMING / ACCEPTED. */
    function setProfileConnectButton(btn, status) {
        btn.classList.toggle("connected", status === "PENDING" || status === "ACCEPTED");
        btn.textContent = !status ? "Connect"
            : status === "INCOMING" ? "Accept request"
            : status === "PENDING" ? "Requested" : "Connected";
    }

    /**
     * A discover card that nobody has signed up as. Shown in the same view, with
     * the catalog's own details — there is no account to load links or posts from.
     */
    function openCreatorProfile(creator) {
        if (!creator) return;

        document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(m => m.classList.add("hidden"));
        document.getElementById("drawer-chat")?.classList.add("hidden");

        renderProfileView({
            id: null,
            username: (creator.name || "creator").toLowerCase().replace(/\s+/g, "_"),
            displayName: creator.name,
            handle: "@" + (creator.name || "creator").toLowerCase().replace(/\s+/g, "_"),
            niche: creator.niche,
            location: creator.location,
            avatar: creator.avatar,
            bgClass: creator.bgClass,
            bio: `${creator.name} is a ${creator.niche || "creator"} on Conexus. They haven't claimed this profile yet.`,
            totalReach: creator.followers,
            engagement: "—",
            socials: [],
            creatorId: creator.id,
            connected: state.connectedCreatorIds.has(creator.id)
        });

        switchView("view-user-profile");
    }

    document.getElementById("btn-back-from-profile")?.addEventListener("click", () => {
        switchView(previousView || "view-home");
    });

    // Connect from the profile view, keeping every list in step.
    document.getElementById("up-btn-connect")?.addEventListener("click", async (e) => {
        // Hold the element: currentTarget is null once the handler yields at
        // the first await, so it cannot be used after the request.
        const btn = e.currentTarget;
        const creatorId = btn.getAttribute("data-creator-id") || null;
        const ownerId = btn.getAttribute("data-owner-id") || null;
        if (!creatorId && !ownerId) return;

        // Whichever identifies them; most people have no catalog card.
        const targetId = creatorId || `u${ownerId}`;

        btn.disabled = true;
        try {
            const data = await api("/api/connections/toggle", {
                method: "POST",
                body: creatorId ? { targetCreatorId: creatorId } : { targetUserId: parseInt(ownerId, 10) }
            });
            applyConnectionResult(data, targetId, creatorId, ownerId);
            setProfileConnectButton(btn, state.connectionStatus[targetId] || null);
        } catch (err) {
            showToast(describeApiError(err, "Could not update this connection."), "error");
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById("up-btn-message")?.addEventListener("click", async () => {
        if (!currentOpenUserId || !state.currentUser) return;
        try {
            const thread = await api(`/api/chats/with-user?otherUserId=${encodeURIComponent(currentOpenUserId)}`,
                                     { method: "POST" });
            state.chats[thread.id] = thread;
            renderInbox();
            switchView("view-messages");
            openChatThread(thread.id);
        } catch (err) {
            showToast(describeApiError(err, "Could not start this conversation."), "error");
        }
    });




    // The ••• button had no handler at all. Opening the creator is the obvious
    // action for it, and the modal already exists.
    document.addEventListener("click", (e) => {
        const moreBtn = e.target.closest(".creator-more");
        if (!moreBtn) return;
        e.stopPropagation();
        const card = moreBtn.closest(".creator-card");
        if (card) card.click();
    });

    document.addEventListener("click", (e) => {
        const creatorCard = e.target.closest(".creator-card, .rail-person");
        if (creatorCard && !e.target.closest(".connect-button") && !e.target.closest(".creator-more")) {
            const creatorId = creatorCard.getAttribute("data-creator-id");
            // Discover cards carry the account directly.
            const ownerId = creatorCard.getAttribute("data-owner-id");
            if (ownerId) {
                openUserProfile(ownerId);
                return;
            }

            let creator = state.creators.find(c => c.id === creatorId);

            // Prefer the real account: it has their actual bio, links and stats.
            if (creator && creator.userId) {
                openUserProfile(creator.userId);
                return;
            }

            if (creator) {
                openCreatorProfile(creator);
                return;
            }

            if (!creator) {
                const name = creatorCard.querySelector("h3")?.textContent || "Creator";
                const niche = creatorCard.querySelector(".creator-type")?.textContent || "Creator";
                const loc = creatorCard.querySelector(".creator-info")?.textContent || "Worldwide";
                const followers = creatorCard.querySelector(".creator-followers")?.textContent || "10K";
                const avatar = creatorCard.querySelector(".creator-avatar")?.textContent || "CR";
                const bgClass = creatorCard.querySelector(".creator-avatar")?.className || "avatar-purple";
                creator = { id: creatorId || "c_" + Date.now(), name, niche, location: loc, followers, avatar, bgClass, match: 88 };
            }
            openCreatorProfile(creator);
        }
    });


    // =========================================================================
    // POST COMMENTS & DETAILS MODAL LOGIC
    // =========================================================================

    const modalPostComments = document.getElementById("modal-post-comments");
    const btnClosePostComments = document.getElementById("btn-close-post-comments");
    const postCommentsList = document.getElementById("post-comments-list");
    const formAddComment = document.getElementById("form-add-comment");
    const inputCommentText = document.getElementById("input-comment-text");

    /** The post the modal is showing. */
    let openPostId = null;
    /** The thread currently shown in the post modal, flat as the API returns it. */
    let currentComments = [];
    /**
     * What the composer is replying to, or null for a new top-level comment.
     * { threadId, targetId, name } — a reply attaches to the top-level comment
     * (threadId) but names whoever was actually answered.
     */
    let replyTarget = null;

    /** Opens a post's detail and comments, from its card or its id. */
    async function openPostCommentsModal(postCardOrId) {
        const postId = typeof postCardOrId === "object"
            ? postCardOrId.getAttribute("data-post-id")
            : String(postCardOrId);
        if (!postId) return;

        const post = state.posts.find(p => String(p.id) === String(postId));
        if (!post) return;

        openPostId = String(postId);
        setReplyTarget(null);
        if (inputCommentText) inputCommentText.value = "";

        const author = post.authorName || "Creator";
        const avatar = document.getElementById("post-detail-avatar");
        if (avatar) {
            avatar.textContent = initials(author);
            avatar.className = "small-avatar";
            applyTone(avatar, post.authorId, author);
        }

        // The byline opens the author's profile, as it does in the feed.
        const authorRow = document.getElementById("post-detail-author-row");
        if (authorRow) {
            authorRow.classList.toggle("is-linked", !!post.authorId);
            if (post.authorId) authorRow.setAttribute("data-user-id", post.authorId);
            else authorRow.removeAttribute("data-user-id");
        }

        const set = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        set("post-detail-author", author);
        set("post-detail-niche", `${post.niche || "Creator"} · ${timeAgo(post.createdAt)}`);
        set("post-detail-content", post.content || "");
        document.getElementById("post-detail-content")?.classList.toggle("hidden", !post.content);

        // Your own post can be deleted from here; profile tiles have no room for it.
        const deleteBtn = document.getElementById("post-detail-delete");
        if (deleteBtn) {
            const mine = state.currentUser && String(post.authorId) === String(state.currentUser.id);
            deleteBtn.classList.toggle("hidden", !mine);
            deleteBtn.setAttribute("data-post-id", post.id);
            deleteBtn.setAttribute("data-confirming", "false");
            deleteBtn.classList.remove("confirming");
            deleteBtn.textContent = "Delete";
            deleteBtn.disabled = false;
        }
        set("post-detail-comment-count", post.commentsCount || 0);

        const imageBox = document.getElementById("post-detail-image");
        if (imageBox) {
            const img = imageBox.querySelector("img");
            const hasImage = !!(post.imageWidth && post.imageHeight);
            imageBox.classList.toggle("hidden", !hasImage);
            imageBox.classList.remove("loaded", "failed");
            img.removeAttribute("src");
            img.removeAttribute("data-post-image");
            if (hasImage) {
                imageBox.style.aspectRatio = `${Number(post.imageWidth)} / ${Number(post.imageHeight)}`;
                img.alt = `Photo shared by ${author}`;
                img.setAttribute("data-post-image", post.id);
                hydratePostImages(imageBox);
            }
        }

        document.getElementById("post-detail-card")?.setAttribute("data-post-id", postId);
        renderPostDetailLike(post);

        if (postCommentsList) {
            postCommentsList.innerHTML = Array.from({ length: 3 }, () => `
                <div class="skel-row skel-list-row" aria-hidden="true">
                    <span class="skel skel-circle sm"></span>
                    <span class="skel-col"><span class="skel skel-line w70"></span><span class="skel skel-line w25"></span></span>
                </div>`).join("");
        }
        modalPostComments?.classList.remove("hidden");

        try {
            currentComments = await api(`/api/comments?postId=${postId}`);
        } catch (e) {
            currentComments = [];
            showToast(describeApiError(e, "Could not load comments."), "error");
        }
        renderCommentsList();
    }

    /** Keeps the like button inside the post detail modal in step with the feed. */
    function renderPostDetailLike(post) {
        const detailCard = document.getElementById("post-detail-card");
        if (!detailCard || !post) return;
        if (detailCard.getAttribute("data-post-id") !== String(post.id)) return;

        const btn = document.getElementById("post-detail-like");
        if (!btn) return;

        btn.classList.toggle("liked", post.liked === true);
        btn.setAttribute("data-liked", post.liked === true);
        btn.innerHTML = `${icon("heart", post.liked ? "icon-fill" : "")} <span id="post-detail-like-count">${post.likesCount || 0}</span>`;
    }

    /**
     * Escapes comment text, then highlights @mentions of people in this thread.
     *
     * Matched against the names actually present rather than a general pattern:
     * display names contain spaces ("Laur Swat"), so a pattern permissive enough
     * to catch those also swallows the words after the name.
     */
    function withMentions(text) {
        const safe = escapeHtml(text);

        const names = [...new Set((currentComments || []).map(c => c.authorName).filter(Boolean))]
            .sort((a, b) => b.length - a.length);   // "@Laur Swat" before "@Laur"

        return names.reduce((out, name) => {
            const tag = "@" + escapeHtml(name);
            return out.split(tag).join(`<span class="comment-mention">${tag}</span>`);
        }, safe);
    }

    /** One comment. Replies reuse the markup, indented, so they work the same. */
    function commentHtml(c, isReply) {
        const liked = c.liked === true;
        const mine = state.currentUser && String(c.authorId) === String(state.currentUser.id);
        const isTarget = replyTarget && String(replyTarget.targetId) === String(c.id);

        return `
            <div class="comment-item${isReply ? " comment-reply" : ""}${c.authorId ? " is-linked" : ""}${isTarget ? " is-reply-target" : ""}" data-comment-id="${escapeHtml(c.id)}"${c.authorId ? ` data-user-id="${escapeHtml(c.authorId)}"` : ""}>
                <div class="comment-avatar tone" ${toneAttrs(c.authorId, c.authorName)}>${escapeHtml(c.avatar || initials(c.authorName))}</div>
                <div class="comment-body">
                    <p class="comment-text"><strong>${escapeHtml(c.authorName)}</strong>${withMentions(c.text)}</p>
                    <div class="comment-actions">
                        <span class="comment-time">${escapeHtml(timeAgo(c.createdAt))}</span>
                        <button class="btn-comment-like${liked ? " liked" : ""}" data-comment-id="${escapeHtml(c.id)}" aria-label="Like comment">
                            ${icon("heart", liked ? "icon-fill" : "")} ${c.likesCount || ""}
                        </button>
                        <button class="btn-comment-reply" data-comment-id="${escapeHtml(c.id)}" data-author="${escapeHtml(c.authorName)}">Reply</button>
                        ${mine ? `<button class="btn-delete btn-delete-comment" data-comment-id="${escapeHtml(c.id)}">Delete</button>` : ""}
                    </div>
                </div>
            </div>
        `;
    }

    function renderCommentsList() {
        if (!postCommentsList) return;

        if (!currentComments.length) {
            postCommentsList.innerHTML = `<div class="comments-empty">No comments yet. Start the conversation.</div>`;
            return;
        }

        const topLevel = currentComments.filter(c => !c.parentId);
        const repliesBy = currentComments.reduce((map, c) => {
            if (c.parentId) (map[c.parentId] = map[c.parentId] || []).push(c);
            return map;
        }, {});

        postCommentsList.innerHTML = topLevel.map(c => `
            <div class="comment-thread">
                ${commentHtml(c, false)}
                ${(repliesBy[c.id] || []).map(rep => commentHtml(rep, true)).join("")}
            </div>
        `).join("");
    }

    /** Points the composer at a comment, or back at the post when null. */
    function setReplyTarget(target) {
        replyTarget = target;

        const banner = document.getElementById("reply-banner");
        const nameEl = document.getElementById("reply-banner-name");
        if (banner) banner.classList.toggle("hidden", !target);
        if (nameEl) nameEl.textContent = target ? target.name : "";
        if (inputCommentText) {
            inputCommentText.placeholder = target ? `Reply to ${target.name}…` : "Add a comment…";
        }
    }

    // ── Comment likes, replies and deletes ─────────────────────────────────
    // Delegated, because the thread is re-rendered after every change.

    document.addEventListener("click", async (e) => {
        const likeBtn = e.target.closest(".btn-comment-like");
        if (!likeBtn) return;
        e.stopPropagation();

        if (!state.currentUser) { showAuthScreen(); return; }

        const commentId = likeBtn.getAttribute("data-comment-id");
        likeBtn.disabled = true;
        try {
            const updated = await api(`/api/comments/${commentId}/like`, { method: "PUT" });
            const c = currentComments.find(x => String(x.id) === String(updated.id));
            if (c) {
                c.liked = updated.liked;
                c.likesCount = updated.likesCount;
            }
            renderCommentsList();
        } catch (err) {
            showToast(describeApiError(err, "Could not save your like."), "error");
            likeBtn.disabled = false;
        }
    });

    document.addEventListener("click", (e) => {
        const replyBtn = e.target.closest(".btn-comment-reply");
        if (!replyBtn) return;
        e.stopPropagation();

        const id = replyBtn.getAttribute("data-comment-id");
        const name = replyBtn.getAttribute("data-author");
        const target = currentComments.find(c => String(c.id) === String(id));
        const threadId = target && target.parentId ? String(target.parentId) : String(id);

        // Pressing Reply on the comment already targeted goes back to a comment.
        const same = replyTarget && String(replyTarget.targetId) === String(id);
        setReplyTarget(same ? null : { threadId, targetId: String(id), name });
        renderCommentsList();

        if (!inputCommentText) return;
        // Prefilled with the tag, the way a reply reads on Instagram.
        const tag = `@${name} `;
        if (same) {
            if (inputCommentText.value.startsWith(tag)) inputCommentText.value = inputCommentText.value.slice(tag.length);
        } else if (!inputCommentText.value.startsWith(tag)) {
            inputCommentText.value = tag + inputCommentText.value.replace(/^@\S+(\s\S+)?\s/, "");
        }
        inputCommentText.focus();
        inputCommentText.setSelectionRange(inputCommentText.value.length, inputCommentText.value.length);
    });

    document.getElementById("btn-cancel-reply")?.addEventListener("click", () => {
        if (replyTarget && inputCommentText) {
            const tag = `@${replyTarget.name} `;
            if (inputCommentText.value.startsWith(tag)) inputCommentText.value = inputCommentText.value.slice(tag.length);
        }
        setReplyTarget(null);
        renderCommentsList();
        inputCommentText?.focus();
    });

    document.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-delete-comment");
        if (!btn) return;
        e.stopPropagation();

        if (!armConfirm(btn, "Delete?")) return;

        const commentId = btn.getAttribute("data-comment-id");
        btn.disabled = true;
        try {
            await api(`/api/comments/${commentId}`, { method: "DELETE" });
            if (replyTarget && (replyTarget.targetId === String(commentId) || replyTarget.threadId === String(commentId))) {
                setReplyTarget(null);
            }
            await refreshComments();
        } catch (err) {
            btn.disabled = false;
            showToast(describeApiError(err, "Could not delete that comment."), "error");
        }
    });

    /** Re-reads the open thread, so the count and order come from the server. */
    async function refreshComments() {
        if (!openPostId) return;
        currentComments = await api(`/api/comments?postId=${openPostId}`);
        renderCommentsList();

        const post = state.posts.find(p => String(p.id) === openPostId);
        if (post) {
            post.commentsCount = currentComments.length;
            renderAllPosts();
        }
        const countEl = document.getElementById("post-detail-comment-count");
        if (countEl) countEl.textContent = currentComments.length;
    }

    btnClosePostComments?.addEventListener("click", () => modalPostComments?.classList.add("hidden"));

    formAddComment?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = inputCommentText ? inputCommentText.value.trim() : "";
        if (!text || !openPostId) return;

        if (!state.currentUser) {
            showAuthScreen();
            return;
        }

        const body = { postId: parseInt(openPostId, 10), text: text };
        if (replyTarget) body.parentId = parseInt(replyTarget.threadId, 10);

        const submit = formAddComment.querySelector("button[type=submit]");
        if (submit) submit.disabled = true;
        try {
            await api("/api/comments", { method: "POST", body });
            inputCommentText.value = "";
            setReplyTarget(null);
            await refreshComments();
            postCommentsList.scrollTop = postCommentsList.scrollHeight;
        } catch (err) {
            showToast(describeApiError(err, "Could not post your comment."), "error");
        } finally {
            if (submit) submit.disabled = false;
        }
    });

    // Opening a post: its comment button, or anywhere on the card that is not
    // a control or a person. Names have their own handler that opens the
    // profile; letting this one run too stacked the post on top of it.
    document.addEventListener("click", (e) => {
        const card = e.target.closest(".inspo-card");
        if (!card) return;
        if (e.target.closest(".btn-comment")) {
            openPostCommentsModal(card);
            return;
        }
        if (e.target.closest("button, a, [data-user-id]")) return;
        openPostCommentsModal(card);
    });

    // =========================================================================
    // GLOBAL MODAL HANDLERS (Close on background click & ESC)
    // =========================================================================

    document.addEventListener("click", (e) => {
        // Only close if clicking exactly on the overlay background (not the card inside)
        if (e.target.classList.contains("modal-overlay")) {
            e.target.classList.add("hidden");
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            // Find all visible modal overlays (except auth screen which is handled separately)
            const openModals = document.querySelectorAll(".modal-overlay:not(.hidden)");
            openModals.forEach(modal => {
                modal.classList.add("hidden");
            });
        }
    });

});
