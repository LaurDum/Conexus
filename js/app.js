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

        // People this user is connected with
        connections: [],

        // Notifications (Populated from backend)
        notifications: [],
        unreadNotifications: 0,

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
        state.currentUser = null;
        state.socials = [];
        state.chats = {};
        state.posts = [];
        showAuthScreen();
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

        // Update header greeting & profile UI
        const name = state.currentUser.displayName || state.currentUser.username;
        if (document.getElementById("header-greeting")) {
            document.getElementById("header-greeting").textContent = `Good evening, ${name} 👋`;
        }

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
        renderHomeCreators();
        await loadDiscover(true);

        try {
            state.posts = await api(`/api/posts`);
        } catch (e) {
            failed.push("feed");
        }
        renderFeed();
        renderUserPosts();

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
        const handle = p.handle || ("@" + u.username);
        const bio = p.bio || u.bio || "Welcome to my profile!";
        const location = p.location || u.location || "Worldwide";
        const reach = p.totalReach || u.totalReach || "0";

        if (document.getElementById("profile-display-name")) document.getElementById("profile-display-name").textContent = dispName;
        if (document.getElementById("profile-handle")) document.getElementById("profile-handle").textContent = handle;
        if (document.getElementById("profile-bio")) document.getElementById("profile-bio").textContent = bio;
        if (document.getElementById("profile-location")) document.getElementById("profile-location").textContent = location;
        if (document.getElementById("stat-total-reach")) document.getElementById("stat-total-reach").textContent = reach;
        if (document.getElementById("stat-engagement")) {
            document.getElementById("stat-engagement").textContent = p.engagement || u.engagement || "0%";
        }

        // Avatar initials
        const avatarEl = document.querySelector(".profile-avatar-lg");
        if (avatarEl && dispName) {
            const initials = dispName.substring(0, Math.min(2, dispName.length)).toUpperCase();
            avatarEl.textContent = initials;
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
            state.currentUser = null;
            state.socials = [];
            state.chats = {};
            state.posts = [];
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
        const label = !connected ? "Connect" : (status === "PENDING" ? "Requested" : "Connected");
        return `
            <article class="creator-card discover-card" data-creator-id="${escapeHtml(c.id || "")}" data-owner-id="${escapeHtml(c.userId || "")}">
                <div class="creator-avatar ${escapeHtml(c.bgClass)}">${escapeHtml(c.avatar)}</div>
                <button class="creator-more" aria-label="More options">•••</button>
                <h3>${escapeHtml(c.name)}</h3>
                <p class="creator-type">${escapeHtml(c.niche)}</p>
                <div class="creator-info">${escapeHtml(c.location)}</div>
                <div class="creator-followers">${escapeHtml(c.followers)} followers</div>
                ${c.match ? `<div class="match"><span>${escapeHtml(c.match)}%</span> match</div>` : ""}
                <button class="connect-button ${connected ? "connected" : ""}" data-name="${escapeHtml(c.name)}">${label}</button>
            </article>
        `;
    }

    /**
     * The Home "Mingle" strip — the best matches, from the database.
     * These were four hardcoded cards, so their Connect buttons never showed
     * the saved state and their stats never matched Discover.
     */
    function renderHomeCreators() {
        const strip = document.getElementById("home-creator-scroll");
        if (!strip) return;

        const top = [...state.creators].sort((a, b) => (b.match || 0) - (a.match || 0)).slice(0, 4);

        strip.innerHTML = top.length
            ? top.map(creatorCardHtml).join("")
            : `<div style="padding: 20px; color: var(--muted); font-size: 0.78rem;">No creators to show yet.</div>`;

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
                <div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--muted); font-size: 0.8rem;">
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

    document.querySelectorAll(".trending-tag").forEach(tagBtn => {
        tagBtn.addEventListener("click", () => {
            const tag = tagBtn.getAttribute("data-tag") || "";
            if (searchInput) {
                searchInput.value = tag;
                searchClear?.classList.remove("hidden");
                loadDiscover(true);
            }
        });
    });


    // =========================================================================
    // CONNECT BUTTON TOGGLE
    // =========================================================================

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

                    if (data.status === "disconnected") {
                        state.connectedCreatorIds.delete(targetId);
                        delete state.connectionStatus[targetId];
                    } else {
                        state.connectedCreatorIds.add(targetId);
                        state.connectionStatus[targetId] = data.status === "requested" ? "PENDING" : "ACCEPTED";
                        showToast(data.status === "requested"
                            ? "Request sent — they'll see it in their messages"
                            : "Connected");
                    }
                    // Keep the loaded page in step, then re-render both lists.
                    const idx = (state.discoverPeople || []).findIndex(pp =>
                        (pp.id && pp.id === creatorId) || (!creatorId && String(pp.userId) === String(ownerId)));
                    if (idx !== -1) state.discoverPeople[idx].connected = data.status !== "disconnected";

                    renderDiscoverCreators();
                    renderHomeCreators();
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
        if (e.target.closest("button, a, input, textarea, select, .comment-actions, .comment-reply-form")) return;

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

            renderFeed();
            renderUserPosts();
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

        // Only steps still unticked count as pending.
        const cards = document.querySelectorAll("#view-recommendations .step-card");
        const pending = [...cards].filter(card => {
            const box = card.querySelector(".step-checkbox");
            return !(box && (box.checked || box.classList.contains("checked")));
        }).length;

        pill.textContent = `${pending} Pending`;
    }

    /** Wording for each kind of notification. */
    const NOTIFICATION_TEXT = {
        POST_LIKE:     { icon: "❤️", verb: "liked your post" },
        POST_COMMENT:  { icon: "💬", verb: "commented on your post" },
        COMMENT_REPLY: { icon: "↩️", verb: "replied to your comment" },
        COMMENT_LIKE:  { icon: "❤️", verb: "liked your comment" },
        CONNECTION:    { icon: "🤝", verb: "connected with you" },
        MESSAGE:       { icon: "✉️", verb: "sent you a message" }
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
                <div style="text-align: center; padding: 28px 20px; color: var(--muted); font-size: 0.8rem;">
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
            renderHomeCreators();
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

            if (accept) {
                showToast("Connection accepted");
                loadConnections();
                // The acceptance is written into the conversation, so refresh it.
                try {
                    const threads = await api(`/api/chats`);
                    state.chats = {};
                    threads.forEach(t => { state.chats[t.id] = t; });
                    renderInbox();
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

        const threadIds = Object.keys(state.chats);
        if (threadIds.length === 0) {
            inboxList.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--muted); font-size: 0.85rem;">
                    No conversation threads yet. Connect with creators on Discover to start chatting!
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
                            <span class="thread-time">${escapeHtml(thread.time || '')}</span>
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

        if (drawerChat) drawerChat.classList.remove("hidden");
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
                <div style="grid-column: 1 / -1; text-align: center; padding: 24px; background: var(--card); border: 1px dashed var(--border); border-radius: var(--radius-sm); color: var(--muted); font-size: 0.76rem;">
                    No social accounts added yet. Click "+ Add Social Link" above to display your channels!
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
                            <a href="${escapeHtml(soc.url)}" target="_blank" rel="noopener" class="btn-social-link" title="Open Link">↗</a>
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
                <div style="text-align: center; padding: 32px 20px; color: var(--muted); font-size: 0.8rem;">
                    No posts yet. Tap "+ New Post" to share the first one!
                </div>
            `;
            return;
        }

        inspoFeed.innerHTML = state.posts.map(post => {
            const author = post.authorName || "Creator";
            const initials = author.substring(0, 2).toUpperCase();
            const avatarClass = post.avatarClass || "avatar-purple";
            const liked = post.liked === true;

            return `
                <article class="inspo-card" data-post-id="${escapeHtml(post.id)}">
                    <div class="post-author${post.authorId ? " is-linked" : ""}"${post.authorId ? ` data-user-id="${escapeHtml(post.authorId)}"` : ""}>
                        <div class="small-avatar ${escapeHtml(avatarClass)}">${escapeHtml(initials)}</div>
                        <div>
                            <strong>${escapeHtml(author)}</strong>
                            <span>${escapeHtml(post.niche || "Creator")} · ${escapeHtml(timeAgo(post.createdAt))}</span>
                        </div>
                    </div>
                    <p class="post-content">${escapeHtml(post.content)}</p>
                    <div class="post-footer">
                        <button class="btn-like ${liked ? "liked" : ""}" data-liked="${liked}">
                            ${liked ? "❤️" : "♡"} <span class="like-count">${post.likesCount || 0}</span>
                        </button>
                        <button class="btn-comment">💬 <span class="comment-count">${post.commentsCount || 0}</span></button>
                        <button class="btn-share">↗ Share</button>
                    </div>
                </article>
            `;
        }).join("");
    }

    /**
     * "Recent Posts" on the Profile tab — the logged-in user's own posts.
     * This block used to be hardcoded markup showing one fixed author to
     * everyone who signed in.
     */
    function renderUserPosts() {
        const container = document.getElementById("user-posts-container");
        if (!container) return;

        const user = state.currentUser;
        if (!user) {
            container.innerHTML = "";
            return;
        }

        const mine = state.posts.filter(post =>
            post.authorId != null
                ? String(post.authorId) === String(user.id)
                : post.authorName === (user.displayName || user.username)
        );

        if (!mine.length) {
            container.innerHTML = `
                <div style="text-align: center; padding: 24px; background: var(--card); border: 1px dashed var(--border); border-radius: var(--radius-sm); color: var(--muted); font-size: 0.76rem;">
                    You haven't posted yet. Share something from the "+ New Post" button!
                </div>
            `;
            return;
        }

        container.innerHTML = mine.map(post => `
            <div class="inspo-card">
                <div class="post-author">
                    <div class="small-avatar ${escapeHtml(post.avatarClass || "avatar-purple")}">${escapeHtml((post.authorName || "?").substring(0, 2).toUpperCase())}</div>
                    <div>
                        <strong>${escapeHtml(post.authorName)}</strong>
                        <span>${escapeHtml(post.niche || "Creator")} · ${escapeHtml(timeAgo(post.createdAt))}</span>
                    </div>
                </div>
                <p class="post-content">${escapeHtml(post.content)}</p>
                <div class="post-footer">
                    <button>${post.liked ? "❤️" : "♡"} ${post.likesCount || 0}</button>
                    <button>💬 ${post.commentsCount || 0}</button>
                    <button>↗ Share</button>
                </div>
            </div>
        `).join("");
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

            const nameVal = state.currentUser.displayName || state.currentUser.username;

            // Save first, then render what came back. The old version only injected
            // HTML into the feed, so the post existed until the next refresh.
            try {
                const saved = await api("/api/posts", {
                    method: "POST",
                    body: {
                        authorId: state.currentUser.id,
                        authorName: nameVal,
                        niche: niche,
                        content: text,
                        avatarClass: state.currentUser.bgClass || "avatar-purple"
                    }
                });

                state.posts.unshift(saved);
                renderFeed();
                renderUserPosts();

                formCreatePost.reset();
                closeCreateModal();
                switchView("view-home");
            } catch (err) {
                showToast(describeApiError(err, "Could not publish your post."), "error");
            }
        });
    }


    // =========================================================================
    // AI OUTREACH MODAL
    // =========================================================================

    const modalOutreach = document.getElementById("modal-outreach");
    const btnCloseOutreach = document.getElementById("btn-close-outreach");
    const outreachTargetCreator = document.getElementById("outreach-target-creator");
    const outreachTextBox = document.getElementById("outreach-text-box");
    const btnCopyOutreach = document.getElementById("btn-copy-outreach");
    const btnSendOutreachChat = document.getElementById("btn-send-outreach-chat");

    // "Apply Now" on a brand card had no handler. Drafting an outreach message
    // to that brand is the action the page implies, and that feature exists.
    document.addEventListener("click", (e) => {
        const applyBtn = e.target.closest(".btn-apply-brand");
        if (!applyBtn) return;

        const brandName = applyBtn.closest(".brand-card")?.querySelector("h4, h3, strong")?.textContent?.trim()
            || "this brand";

        if (outreachTargetCreator) outreachTargetCreator.textContent = brandName;
        if (outreachTextBox) {
            outreachTextBox.textContent = `"Hi ${brandName} team! I'd love to be considered for this campaign. My audience overlaps closely with the one you're targeting, and I can put together a hands-on review that fits your brief. Happy to share my full media kit."`;
        }
        if (modalOutreach) modalOutreach.classList.remove("hidden");
    });

    document.querySelectorAll(".btn-open-outreach").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.getAttribute("data-creator") || "Alex Popescu";
            if (outreachTargetCreator) outreachTargetCreator.textContent = target;
            if (outreachTextBox) {
                outreachTextBox.textContent = `"Hey ${target.split(" ")[0]}! Loved your recent content. Based on our audience overlap, I think a joint video or dual stream would perform amazingly for both our channels. Let me know if you'd be down to chat!"`;
            }
            if (modalOutreach) modalOutreach.classList.remove("hidden");
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

    if (btnSendOutreachChat) {
        btnSendOutreachChat.addEventListener("click", () => {
            if (modalOutreach) modalOutreach.classList.add("hidden");
            switchView("view-messages");

            // Open the user's most recent thread rather than a hardcoded id that
            // may not belong to this account.
            const firstThreadId = Object.keys(state.chats)[0];
            if (firstThreadId) openChatThread(firstThreadId);
        });
    }


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
                                <a href="${escapeHtml(soc.url || "#")}" target="_blank" rel="noopener" class="btn-social-link" title="Open Link">↗</a>
                            </div>
                        </div>`;
                }).join("")
                : `<div style="grid-column: 1 / -1; padding: 20px; color: var(--muted); font-size: 0.78rem;">No linked accounts yet.</div>`;
        }

        // Their posts, from the feed we already hold.
        const postsEl = document.getElementById("up-posts");
        if (postsEl) {
            const theirs = state.posts.filter(post => String(post.authorId) === String(profile.id));
            postsEl.innerHTML = theirs.length
                ? theirs.map(post => `
                    <div class="inspo-card" data-post-id="${escapeHtml(post.id)}">
                        <p class="post-content">${escapeHtml(post.content)}</p>
                        <div class="post-footer">
                            <button>${post.liked ? "❤️" : "♡"} ${post.likesCount || 0}</button>
                            <button>💬 ${post.commentsCount || 0}</button>
                            <span style="color: var(--muted); font-size: 0.72rem;">${escapeHtml(timeAgo(post.createdAt))}</span>
                        </div>
                    </div>`).join("")
                : `<div style="padding: 20px; color: var(--muted); font-size: 0.78rem;">No posts yet.</div>`;
        }

        // Connect only means something for someone with a discover card.
        const connectBtn = document.getElementById("up-btn-connect");
        if (connectBtn) {
            connectBtn.style.display = profile.creatorId ? "" : "none";
            connectBtn.classList.toggle("connected", profile.connected);
            connectBtn.textContent = profile.connected ? "Requested" : "Connect";
            connectBtn.setAttribute("data-creator-id", profile.creatorId || "");
        }

        // Messaging needs an account on the other end.
        const messageBtn = document.getElementById("up-btn-message");
        if (messageBtn) messageBtn.style.display = profile.id ? "" : "none";

        switchView("view-user-profile");
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
        const targetId = btn.getAttribute("data-creator-id");
        if (!targetId) return;

        btn.disabled = true;
        try {
            const data = await api("/api/connections/toggle", {
                method: "POST",
                body: { targetCreatorId: targetId }
            });
            const connected = data.status !== "disconnected";
            if (connected) {
                state.connectedCreatorIds.add(targetId);
                state.connectionStatus[targetId] = data.status === "requested" ? "PENDING" : "ACCEPTED";
                showToast(data.status === "requested"
                    ? "Request sent — they'll see it in their messages"
                    : "Connected");
            } else {
                state.connectedCreatorIds.delete(targetId);
                delete state.connectionStatus[targetId];
            }

            btn.classList.toggle("connected", connected);
            btn.textContent = !connected ? "Connect"
                : (state.connectionStatus[targetId] === "PENDING" ? "Requested" : "Connected");
            renderDiscoverCreators();
            renderHomeCreators();
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
    const postDetailAvatar = document.getElementById("post-detail-avatar");
    const postDetailAuthor = document.getElementById("post-detail-author");
    const postDetailNiche = document.getElementById("post-detail-niche");
    const postDetailContent = document.getElementById("post-detail-content");
    const postDetailCommentCount = document.getElementById("post-detail-comment-count");
    const postCommentsList = document.getElementById("post-comments-list");
    const formAddComment = document.getElementById("form-add-comment");
    const inputCommentText = document.getElementById("input-comment-text");

    let currentOpenPostCard = null;

    const postCommentsStore = {
        default: [
            { author: "Alex Popescu", avatar: "AP", bgClass: "avatar-purple", time: "15m ago", text: "Great insights! Definitely trying this format strategy." },
            { author: "Elena M.", avatar: "EM", bgClass: "avatar-green", time: "1h ago", text: "Loved the breakdown! Would love to see a follow up post." }
        ]
    };

    async function openPostCommentsModal(postCard) {
        currentOpenPostCard = postCard;

        const authorName = postCard.querySelector(".post-author strong")?.textContent || "Creator";
        const authorMeta = postCard.querySelector(".post-author span")?.textContent || "Creator · Recent";
        const avatarEl = postCard.querySelector(".small-avatar");
        const avatarText = avatarEl?.textContent || "CR";
        const avatarClass = avatarEl?.className || "small-avatar avatar-purple";
        const content = postCard.querySelector(".post-content")?.textContent || "";
        const commentCountSpan = postCard.querySelector(".comment-count");
        const commentCount = commentCountSpan ? commentCountSpan.textContent : "0";

        if (postDetailAvatar) {
            postDetailAvatar.textContent = avatarText;
            postDetailAvatar.className = avatarClass;
        }
        if (postDetailAuthor) postDetailAuthor.textContent = authorName;
        if (postDetailNiche) postDetailNiche.textContent = authorMeta;
        if (postDetailContent) postDetailContent.textContent = content;
        if (postDetailCommentCount) postDetailCommentCount.textContent = commentCount;

        const postId = postCard.getAttribute("data-post-id");
        if (!postId) return;

        // Tag the modal so the shared like handler knows which post it is on.
        const detailCard = document.getElementById("post-detail-card");
        if (detailCard) detailCard.setAttribute("data-post-id", postId);
        renderPostDetailLike(state.posts.find(p => String(p.id) === String(postId)));

        try {
            currentComments = await api(`/api/comments?postId=${postId}`);
            renderCommentsList(currentComments);
        } catch (e) {
            currentComments = [];
            renderCommentsList([]);
            showToast(describeApiError(e, "Could not load comments."), "error");
        }

        if (modalPostComments) modalPostComments.classList.remove("hidden");
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

    /** The thread currently shown in the post modal, flat as the API returns it. */
    let currentComments = [];
    /** Which comment the reply box is currently attached to. */
    let replyingToId = null;

    /**
     * Renders one comment. Replies reuse the same markup, indented, so a reply
     * can be liked and replied to exactly like a top-level comment.
     */
    function commentHtml(c, isReply) {
        const liked = c.liked === true;
        const count = c.likesCount || 0;

        return `
            <div class="comment-item${isReply ? " comment-reply" : ""}${c.authorId ? " is-linked" : ""}" data-comment-id="${escapeHtml(c.id)}"${c.authorId ? ` data-user-id="${escapeHtml(c.authorId)}"` : ""}>
                <div class="comment-avatar ${escapeHtml(c.bgClass)}">${escapeHtml(c.avatar)}</div>
                <div class="comment-body">
                    <div class="comment-header">
                        <strong>${escapeHtml(c.authorName)}</strong>
                        <span>${escapeHtml(timeAgo(c.createdAt))}</span>
                    </div>
                    <p>${escapeHtml(c.text)}</p>
                    <div class="comment-actions">
                        <button class="btn-comment-like${liked ? " liked" : ""}" data-comment-id="${escapeHtml(c.id)}" data-liked="${liked}">
                            ${liked ? "❤️" : "♡"} <span class="comment-like-count">${count}</span>
                        </button>
                        <button class="btn-comment-reply" data-comment-id="${escapeHtml(c.id)}">Reply</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderCommentsList(comments) {
        if (!postCommentsList) return;

        if (!comments.length) {
            postCommentsList.innerHTML = `
                <div style="padding: 18px; color: var(--muted); font-size: 0.78rem; text-align: center;">
                    No comments yet. Be the first to reply.
                </div>
            `;
            return;
        }

        const topLevel = comments.filter(c => !c.parentId);
        const repliesBy = comments.reduce((map, c) => {
            if (c.parentId) (map[c.parentId] = map[c.parentId] || []).push(c);
            return map;
        }, {});

        postCommentsList.innerHTML = topLevel.map(c => {
            const replies = repliesBy[c.id] || [];
            return `
                <div class="comment-thread">
                    ${commentHtml(c, false)}
                    ${replies.map(rep => commentHtml(rep, true)).join("")}
                    ${replyingToId === String(c.id) ? replyBoxHtml(c) : ""}
                </div>
            `;
        }).join("");
    }

    function replyBoxHtml(parent) {
        return `
            <form class="comment-reply-form" data-parent-id="${escapeHtml(parent.id)}">
                <input type="text" class="comment-reply-input" placeholder="Reply to ${escapeHtml(parent.authorName)}..." autocomplete="off" required>
                <button type="submit" class="btn-reply-send">Reply</button>
                <button type="button" class="btn-reply-cancel">Cancel</button>
            </form>
        `;
    }

    // ── Comment likes and replies ──────────────────────────────────────────
    // Delegated, because the thread is re-rendered after every change.

    document.addEventListener("click", async (e) => {
        const likeBtn = e.target.closest(".btn-comment-like");
        if (!likeBtn) return;
        e.stopPropagation();          // do not open the author's profile

        if (!state.currentUser) { showAuthScreen(); return; }

        const commentId = likeBtn.getAttribute("data-comment-id");
        likeBtn.disabled = true;
        try {
            const updated = await api(`/api/comments/${commentId}/like`, { method: "PUT" });

            const idx = currentComments.findIndex(c => String(c.id) === String(updated.id));
            if (idx !== -1) {
                currentComments[idx].liked = updated.liked;
                currentComments[idx].likesCount = updated.likesCount;
            }
            renderCommentsList(currentComments);
        } catch (err) {
            showToast(describeApiError(err, "Could not save your like."), "error");
            likeBtn.disabled = false;
        }
    });

    document.addEventListener("click", (e) => {
        const replyBtn = e.target.closest(".btn-comment-reply");
        if (replyBtn) {
            e.stopPropagation();
            const id = replyBtn.getAttribute("data-comment-id");
            // Toggle: pressing Reply on the open box closes it.
            replyingToId = replyingToId === id ? null : id;
            renderCommentsList(currentComments);
            postCommentsList?.querySelector(".comment-reply-input")?.focus();
            return;
        }

        if (e.target.closest(".btn-reply-cancel")) {
            e.stopPropagation();
            replyingToId = null;
            renderCommentsList(currentComments);
        }
    });

    document.addEventListener("submit", async (e) => {
        const form = e.target.closest(".comment-reply-form");
        if (!form) return;
        e.preventDefault();
        e.stopPropagation();

        if (!state.currentUser) { showAuthScreen(); return; }

        const input = form.querySelector(".comment-reply-input");
        const text = input ? input.value.trim() : "";
        const parentId = form.getAttribute("data-parent-id");
        const postId = currentOpenPostCard?.getAttribute("data-post-id");
        if (!text || !postId) return;

        try {
            await api("/api/comments", {
                method: "POST",
                body: { postId: parseInt(postId, 10), parentId: parseInt(parentId, 10), text: text }
            });

            replyingToId = null;
            currentComments = await api(`/api/comments?postId=${postId}`);
            renderCommentsList(currentComments);
            bumpCommentCount(postId, currentComments.length);
        } catch (err) {
            showToast(describeApiError(err, "Could not post your reply."), "error");
        }
    });

    /** Keeps the count on the feed card and the modal header in step. */
    function bumpCommentCount(postId, total) {
        const idx = state.posts.findIndex(p => String(p.id) === String(postId));
        if (idx !== -1) {
            state.posts[idx].commentsCount = total;
            renderFeed();
            renderUserPosts();
            currentOpenPostCard = document.querySelector(`.inspo-card[data-post-id="${postId}"]`) || currentOpenPostCard;
        }
        if (postDetailCommentCount) postDetailCommentCount.textContent = total;
    }

    if (btnClosePostComments && modalPostComments) {
        btnClosePostComments.addEventListener("click", () => modalPostComments.classList.add("hidden"));
    }

    if (formAddComment) {
        formAddComment.addEventListener("submit", async (e) => {
            e.preventDefault();
            const text = inputCommentText ? inputCommentText.value.trim() : "";
            if (!text || !currentOpenPostCard) return;

            if (!state.currentUser) {
                showAuthScreen();
                return;
            }

            // Defaulting to user 1 / post 1 used to attach comments to whatever
            // happened to be row 1 in the database.
            const postId = currentOpenPostCard.getAttribute("data-post-id");
            if (!postId) return;

            try {
                await api("/api/comments", {
                    method: "POST",
                    body: { postId: parseInt(postId, 10), text: text }
                });

                inputCommentText.value = "";

                // Re-read the thread so the new comment, and the count, come
                // from the server rather than being guessed at locally.
                currentComments = await api(`/api/comments?postId=${postId}`);
                renderCommentsList(currentComments);
                bumpCommentCount(postId, currentComments.length);
            } catch (e) {
                showToast(describeApiError(e, "Could not post your comment."), "error");
            }
        });
    }

    document.addEventListener("click", (e) => {
        const commentBtn = e.target.closest(".btn-comment");
        if (commentBtn) {
            const inspoCard = commentBtn.closest(".inspo-card");
            if (inspoCard) openPostCommentsModal(inspoCard);
            return;
        }

        const inspoCard = e.target.closest(".inspo-card");
        if (inspoCard && !e.target.closest(".btn-like") && !e.target.closest(".btn-share")) {
            openPostCommentsModal(inspoCard);
        }
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