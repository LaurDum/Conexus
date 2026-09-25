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
        youtube:   { name: "YouTube", icon: "▶", class: "platform-youtube" },
        tiktok:    { name: "TikTok", icon: "🎵", class: "platform-tiktok" },
        instagram: { name: "Instagram", icon: "📷", class: "platform-instagram" },
        twitch:    { name: "Twitch", icon: "👾", class: "platform-twitch" },
        twitter:   { name: "X (Twitter)", icon: "𝕏", class: "platform-twitter" },
        discord:   { name: "Discord", icon: "💬", class: "platform-discord" },
        spotify:   { name: "Spotify", icon: "🎧", class: "platform-spotify" },
        substack:  { name: "Substack", icon: "📰", class: "platform-substack" },
        linkedin:  { name: "LinkedIn", icon: "💼", class: "platform-linkedin" },
        website:   { name: "Website", icon: "🌐", class: "platform-website" }
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

        document.querySelectorAll(".modal-overlay").forEach(m => m.classList.add("hidden"));
        document.getElementById("drawer-chat")?.classList.add("hidden");
        document.getElementById("drawer-notifications")?.classList.add("hidden");
        ["inspo-feed", "inbox-list", "home-creator-scroll", "discover-creators-grid",
         "user-posts-container", "socials-container", "notification-list"].forEach(id => {
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
                requestAnimationFrame(() => bubble.classList.remove("no-animation"));
            });
        }

        loadUserData();
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
        if (greetingEl) greetingEl.textContent = `${greetingFor(new Date())}, ${name} 👋`;

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
            avatarEl.className = `creator-avatar ${u.bgClass || "avatar-purple"} profile-avatar-lg`;
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

    const navItems = document.querySelectorAll(".bottom-nav .nav-item");
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
                <div class="creator-avatar ${escapeHtml(c.bgClass)}">${escapeHtml(c.avatar || initials(c.name))}</div>
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

        bindConnectButtons();
    }

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

                const creatorCard = button.closest(".creator-card");
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

        const card = document.querySelector(`.inspo-card[data-post-id="${match[1]}"]`);
        if (!card) return;

        card.scrollIntoView({ behavior: "smooth", block: "center" });
        openPostCommentsModal(card);
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
        POST_LIKE:     { icon: "❤️", verb: "liked your post" },
        POST_COMMENT:  { icon: "💬", verb: "commented on your post" },
        COMMENT_REPLY: { icon: "↩️", verb: "replied to your comment" },
        COMMENT_LIKE:  { icon: "❤️", verb: "liked your comment" },
        CONNECTION:    { icon: "🤝", verb: "connected with you" },
        MESSAGE:       { icon: "✉️", verb: "sent you a message" },
        JOB_APPLICATION: { icon: "📄", verb: "applied to your listing" }
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
            const meta = NOTIFICATION_TEXT[n.type] || { icon: "✦", verb: "interacted with you" };
            return `
                <div class="notification-item${n.read ? "" : " unread"}" data-notification-id="${escapeHtml(n.id)}">
                    <div class="noti-icon">${meta.icon}</div>
                    <div class="noti-content">
                        <p><strong>${escapeHtml(n.actorName || "Someone")}</strong> ${meta.verb}.</p>
                        ${n.excerpt ? `<p class="noti-excerpt">${escapeHtml(n.excerpt)}</p>` : ""}
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
            switchView("view-home");
            const card = document.querySelector(`.inspo-card[data-post-id="${n.postId}"]`);
            if (card) {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
                openPostCommentsModal(card);
            }
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
                    <div class="creator-avatar ${escapeHtml(c.bgClass)}"${c.userId ? ` data-user-id="${escapeHtml(c.userId)}"` : ""}>${escapeHtml(c.avatar)}</div>
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
                <div class="creator-avatar ${escapeHtml(req.bgClass)}"${req.requesterId ? ` data-user-id="${escapeHtml(req.requesterId)}"` : ""}>${escapeHtml(req.avatar)}</div>
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
                    <div class="creator-avatar ${escapeHtml(thread.bgClass)}">${escapeHtml(thread.avatar)}</div>
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
            chatHeaderAvatar.className = `small-avatar ${threadData.bgClass}`;
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
    const statPlatformsCount = document.getElementById("stat-platforms-count");
    const modalAddSocial = document.getElementById("modal-add-social");
    const btnOpenAddSocial = document.getElementById("btn-open-add-social");
    const btnCloseSocialModal = document.getElementById("btn-close-social-modal");
    const btnCancelSocial = document.getElementById("btn-cancel-social");
    const formAddSocial = document.getElementById("form-add-social");

    function renderSocials() {
        if (!socialsContainer) return;

        if (state.socials.length === 0) {
            socialsContainer.innerHTML = `
                <div class="empty-card">
                    No social accounts yet. Use "+ Add Social Link" to show your channels.
                </div>
            `;
        } else {
            socialsContainer.innerHTML = state.socials.map(soc => {
                const meta = platformMeta[soc.platform] || { name: soc.platform, icon: "🌐", class: "platform-website" };
                return `
                    <div class="social-card" data-social-id="${escapeHtml(soc.id)}">
                        <div class="social-left">
                            <div class="social-icon-badge ${meta.class}">
                                ${meta.icon}
                            </div>
                            <div class="social-info">
                                <div class="social-platform-name">${escapeHtml(meta.name)}</div>
                                <div class="social-handle-text">${escapeHtml(soc.handle)}</div>
                                <div class="social-count-badge">${escapeHtml(soc.followers)}</div>
                            </div>
                        </div>
                        <div class="social-actions">
                            <a href="${escapeHtml(safeUrl(soc.url))}" target="_blank" rel="noopener" class="btn-social-link" title="Open Link">↗</a>
                            <button class="btn-social-edit" data-id="${escapeHtml(soc.id)}" title="Edit Account">✎</button>
                            <button class="btn-social-delete" data-id="${escapeHtml(soc.id)}" title="Remove Account">&times;</button>
                        </div>
                    </div>
                `;
            }).join("");
        }

        if (statPlatformsCount) {
            statPlatformsCount.textContent = state.socials.length;
        }

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

            const meta = platformMeta[platform] || { name: platform, icon: "🌐" };

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
        if (modalCreate) modalCreate.classList.remove("hidden");
    }
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

        if (!state.posts.length) {
            inspoFeed.innerHTML = `
                <div class="empty-card">
                    No posts yet. Use "+ New Post" to share the first one.
                </div>
            `;
            return;
        }

        inspoFeed.innerHTML = state.posts.map(postCardHtml).join("");
    }

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
                    <div class="small-avatar ${escapeHtml(post.avatarClass || "avatar-purple")}">${escapeHtml(initials(author))}</div>
                    <div>
                        <strong>${escapeHtml(author)}</strong>
                        <span>${escapeHtml(post.niche || "Creator")} · ${escapeHtml(timeAgo(post.createdAt))}</span>
                    </div>
                </div>
                <p class="post-content">${escapeHtml(post.content)}</p>
                <div class="post-footer">
                    <button class="btn-like ${liked ? "liked" : ""}" data-liked="${liked}" aria-label="Like">
                        ${liked ? "❤️" : "♡"} <span class="like-count">${post.likesCount || 0}</span>
                    </button>
                    <button class="btn-comment" aria-label="Comments">💬 <span class="comment-count">${post.commentsCount || 0}</span></button>
                    <button class="btn-share">↗ Share</button>
                    ${mine ? `<button class="btn-delete btn-delete-post" data-post-id="${escapeHtml(post.id)}">Delete</button>` : ""}
                </div>
            </article>
        `;
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

        container.innerHTML = mine.length
            ? mine.map(postCardHtml).join("")
            : `<div class="empty-card">You haven't posted yet. Share something with "+ New Post".</div>`;
    }

    /** Posts on someone else's profile page, from the feed we already hold. */
    function renderProfilePosts() {
        const postsEl = document.getElementById("up-posts");
        if (!postsEl || !currentOpenUserId) return;

        const theirs = state.posts.filter(post => String(post.authorId) === String(currentOpenUserId));
        postsEl.innerHTML = theirs.length
            ? theirs.map(postCardHtml).join("")
            : `<div class="empty-card">No posts yet.</div>`;
    }

    /** Every place a post is drawn, after one of them changes. */
    function renderAllPosts() {
        renderFeed();
        renderUserPosts();
        renderProfilePosts();
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
            const niche = document.getElementById("create-post-niche").value;

            if (!text) return;

            // Save first, then render what came back. The server fills in the
            // author from the session.
            try {
                const saved = await api("/api/posts", {
                    method: "POST",
                    body: { niche: niche, content: text }
                });

                state.posts.unshift(saved);
                renderAllPosts();

                formCreatePost.reset();
                closeCreateModal();
                switchView("view-home");
            } catch (err) {
                showToast(describeApiError(err, "Could not publish your post."), "error");
            }
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
        document.querySelectorAll(".discover-tab").forEach(t => {
            const on = t.getAttribute("data-pane") === pane;
            t.classList.toggle("active", on);
            t.setAttribute("aria-selected", String(on));
        });

        moveDiscoverUnderline();

        if (pane === "jobs" && !paneLoaded.jobs) { paneLoaded.jobs = true; loadAllJobs(); }
        if (pane === "deals" && !paneLoaded.deals) { paneLoaded.deals = true; loadAllDeals(); }
    }

    /** Slides the underline to the active tab, measured from the tab itself. */
    function moveDiscoverUnderline() {
        const bar = document.getElementById("discover-tabs");
        const line = document.getElementById("discover-tab-underline");
        const active = bar?.querySelector(".discover-tab.active");
        if (!bar || !line || !active) return;

        const barRect = bar.getBoundingClientRect();
        const tabRect = active.getBoundingClientRect();
        if (tabRect.width === 0) return;   // laid out but not visible yet

        line.style.width = `${tabRect.width}px`;
        line.style.transform = `translateX(${tabRect.left - barRect.left}px)`;
    }

    document.querySelectorAll(".discover-tab").forEach(tab => {
        tab.addEventListener("click", () => showDiscoverPane(tab.getAttribute("data-pane")));
    });

    window.addEventListener("resize", moveDiscoverUnderline);

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
                        <div class="creator-avatar ${escapeHtml(a.bgClass)}" data-user-id="${escapeHtml(a.userId)}">${escapeHtml(a.avatar)}</div>
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

    const SECTION_LABELS = {
        recommendations: { name: "Recommendations", hint: "Conexus AI suggestions" },
        mingle:          { name: "Mingle", hint: "Creators you might click with" },
        inspo:           { name: "Inspo", hint: "Posts from your network" },
        jobs:            { name: "Jobs", hint: "Paid roles for creators" },
        deals:           { name: "Brand Deals", hint: "Open campaigns" }
    };

    async function loadPreferences() {
        try {
            state.preferences = await api("/api/preferences");
        } catch (err) {
            state.preferences = { homeSections: ["recommendations", "mingle", "inspo"], theme: "dark",
                                  available: Object.keys(SECTION_LABELS), maxSections: 4 };
        }
        applyTheme(state.preferences.theme);
        applyHomeSections();
        renderSectionPicker();
    }

    /** Shows only the chosen sections, in the order they were chosen. */
    function applyHomeSections() {
        const chosen = state.preferences?.homeSections || [];
        const home = document.getElementById("view-home");
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
        const max = state.preferences.maxSections || 4;

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
        const hint = document.querySelector(".settings-hint");
        if (hint) {
            hint.innerHTML = remaining
                ? `Choose which sections appear, up to <strong>${max}</strong>. ${remaining} slot${remaining === 1 ? "" : "s"} left.`
                : `Choose which sections appear, up to <strong>${max}</strong>. Uncheck one to swap it out.`;
        }

        picker.querySelectorAll("input[type=checkbox]").forEach(box => {
            box.addEventListener("change", () => saveSections(box));
        });
    }

    async function saveSections(changedBox) {
        const picked = [...document.querySelectorAll("#section-picker input:checked")]
            .map(b => b.getAttribute("data-section"));

        if (!picked.length) {
            changedBox.checked = true;   // never leave home empty
            showToast("Keep at least one section on your home screen", "error");
            return;
        }

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
            avatarEl.textContent = profile.avatar || name.substring(0, 2).toUpperCase();
            avatarEl.className = `creator-avatar ${profile.bgClass || "avatar-purple"} profile-avatar-lg`;
        }

        set("up-display-name", name);
        set("up-handle", profile.handle || ("@" + profile.username));
        set("up-bio", profile.bio || "This creator hasn't written a bio yet.");
        set("up-location", profile.location || "Worldwide");
        set("up-niche", profile.niche || "Creator");
        set("up-reach", profile.totalReach || "0");
        set("up-engagement", profile.engagement || "0%");
        set("up-platforms", (profile.socials || []).length);
        set("up-match", currentOpenCreator ? `${currentOpenCreator.match}%` : "—");

        // Their linked accounts, rendered like the ones on your own profile.
        const socialsEl = document.getElementById("up-socials");
        if (socialsEl) {
            socialsEl.innerHTML = (profile.socials || []).length
                ? profile.socials.map(soc => {
                    const meta = platformMeta[soc.platform] || { name: soc.platform, icon: "🌐", class: "platform-website" };
                    return `
                        <div class="social-card">
                            <div class="social-left">
                                <div class="social-icon-badge ${meta.class}">${meta.icon}</div>
                                <div class="social-info">
                                    <div class="social-platform-name">${escapeHtml(meta.name)}</div>
                                    <div class="social-handle-text">${escapeHtml(soc.handle || "")}</div>
                                    <div class="social-count-badge">${escapeHtml(soc.followers || "0")}</div>
                                </div>
                            </div>
                            <div class="social-actions">
                                <a href="${escapeHtml(safeUrl(soc.url))}" target="_blank" rel="noopener" class="btn-social-link" title="Open Link">↗</a>
                            </div>
                        </div>`;
                }).join("")
                : `<div class="empty-card">No linked accounts yet.</div>`;
        }

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
        const creatorCard = e.target.closest(".creator-card");
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

    async function openPostCommentsModal(postCard) {
        const postId = postCard.getAttribute("data-post-id");
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
            avatar.className = `small-avatar ${post.avatarClass || "avatar-purple"}`;
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
        set("post-detail-content", post.content);
        set("post-detail-comment-count", post.commentsCount || 0);

        document.getElementById("post-detail-card")?.setAttribute("data-post-id", postId);
        renderPostDetailLike(post);

        if (postCommentsList) postCommentsList.innerHTML = `<div class="comments-empty">Loading…</div>`;
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
        btn.innerHTML = `${post.liked ? "❤️" : "♡"} <span id="post-detail-like-count">${post.likesCount || 0}</span>`;
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
                <div class="comment-avatar ${escapeHtml(c.bgClass || "avatar-purple")}">${escapeHtml(c.avatar || initials(c.authorName))}</div>
                <div class="comment-body">
                    <p class="comment-text"><strong>${escapeHtml(c.authorName)}</strong>${withMentions(c.text)}</p>
                    <div class="comment-actions">
                        <span class="comment-time">${escapeHtml(timeAgo(c.createdAt))}</span>
                        <button class="btn-comment-like${liked ? " liked" : ""}" data-comment-id="${escapeHtml(c.id)}" aria-label="Like comment">
                            ${liked ? "❤️" : "♡"} ${c.likesCount || ""}
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
