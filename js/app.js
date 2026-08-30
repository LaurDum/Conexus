document.addEventListener("DOMContentLoaded", () => {

    // =========================================================================
    // API BASE URL — works from any host (localhost, LAN IP, etc.)
    // =========================================================================

    // Backend always runs on the same machine as the server, port 8080.
    // When accessing via LAN (e.g. 192.168.x.x:5500), we still hit 8080 on
    // that same machine, so we just replace the port from whatever it is now.
    const API_BASE = `${window.location.protocol}//${window.location.hostname}:8080`;

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

        try {
            const fetchedCreators = await api(`/api/creators`);
            state.creators = fetchedCreators.map(c => ({
                id: c.id,
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
            const connectedIds = await api(`/api/connections`);
            state.connectedCreatorIds = new Set(connectedIds);
        } catch (e) {
            failed.push("connections");
        }
        renderDiscoverCreators();

        try {
            state.posts = await api(`/api/posts`);
        } catch (e) {
            failed.push("feed");
        }
        renderFeed();
        renderUserPosts();

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

    const navItems = document.querySelectorAll(".bottom-nav .nav-item");
    const views = document.querySelectorAll(".main-content .view");

    function switchView(targetViewId) {
        if (!state.currentUser) {
            showAuthScreen();
            return;
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

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

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
            drawerNotifications.classList.toggle("hidden");
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

    function renderDiscoverCreators() {
        if (!discoverGrid) return;

        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";

        const filtered = state.creators.filter(c => {
            const matchCategory = currentCategory === "all" || c.category.toLowerCase() === currentCategory.toLowerCase();
            const matchQuery = !query || c.name.toLowerCase().includes(query) || c.niche.toLowerCase().includes(query) || c.location.toLowerCase().includes(query);
            return matchCategory && matchQuery;
        });

        if (filtered.length === 0) {
            discoverGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--muted); font-size: 0.8rem;">
                    No creators found matching your search criteria.
                </div>
            `;
            return;
        }

        discoverGrid.innerHTML = filtered.map(c => {
            const connected = state.connectedCreatorIds.has(c.id);
            return `
            <article class="creator-card discover-card" data-creator-id="${escapeHtml(c.id)}">
                <div class="creator-avatar ${escapeHtml(c.bgClass)}">${escapeHtml(c.avatar)}</div>
                <h3>${escapeHtml(c.name)}</h3>
                <p class="creator-type">${escapeHtml(c.niche)}</p>
                <div class="creator-info">${escapeHtml(c.location)}</div>
                <div class="creator-followers">${escapeHtml(c.followers)} followers</div>
                <div class="match"><span>${escapeHtml(c.match)}%</span> match</div>
                <button class="connect-button ${connected ? "connected" : ""}" data-name="${escapeHtml(c.name)}">${connected ? "Requested" : "Connect"}</button>
            </article>
            `;
        }).join("");

        bindConnectButtons();
    }

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            if (searchInput.value.length > 0) {
                searchClear?.classList.remove("hidden");
            } else {
                searchClear?.classList.add("hidden");
            }
            renderDiscoverCreators();
        });

        searchClear?.addEventListener("click", () => {
            searchInput.value = "";
            searchClear.classList.add("hidden");
            renderDiscoverCreators();
        });
    }

    if (filterChipsContainer) {
        filterChipsContainer.querySelectorAll(".chip").forEach(chip => {
            chip.addEventListener("click", () => {
                filterChipsContainer.querySelectorAll(".chip").forEach(ch => ch.classList.remove("active"));
                chip.classList.add("active");
                currentCategory = chip.getAttribute("data-category") || "all";
                renderDiscoverCreators();
            });
        });
    }

    document.querySelectorAll(".trending-tag").forEach(tagBtn => {
        tagBtn.addEventListener("click", () => {
            const tag = tagBtn.getAttribute("data-tag") || "";
            if (searchInput) {
                searchInput.value = tag;
                searchClear?.classList.remove("hidden");
                renderDiscoverCreators();
            }
        });
    });

    renderDiscoverCreators();


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
                const targetId = creatorCard ? creatorCard.getAttribute("data-creator-id") : null;
                
                if (!targetId) return;

                const reqBody = { targetCreatorId: targetId };

                button.disabled = true;
                try {
                    const data = await api("/api/connections/toggle", { method: "POST", body: reqBody });

                    if (data.status === "connected") {
                        state.connectedCreatorIds.add(targetId);
                        button.classList.add("connected");
                        button.textContent = "Requested";
                    } else {
                        state.connectedCreatorIds.delete(targetId);
                        button.classList.remove("connected");
                        button.textContent = "Connect";
                    }
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
                <div class="chat-thread ${thread.unread ? 'unread' : ''}" data-thread-id="${id}">
                    <div class="creator-avatar ${thread.bgClass}">${thread.avatar}</div>
                    <div class="thread-info">
                        <div class="thread-top">
                            <h4>${thread.name}</h4>
                            <span class="thread-time">${thread.time || ''}</span>
                        </div>
                        <p class="thread-snippet">${thread.snippet || ''}</p>
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

        renderChatMessages(threadData.messages || []);

        if (drawerChat) drawerChat.classList.remove("hidden");
    }

    function renderChatMessages(messages) {
        if (!chatMessagesContainer) return;

        chatMessagesContainer.innerHTML = messages.map(msg => `
            <div class="msg-bubble ${msg.sender === "me" ? "sent" : "received"}">
                <p>${msg.text}</p>
                <span class="msg-time">${msg.time}</span>
            </div>
        `).join("");

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
                    <div class="social-card" data-social-id="${soc.id}">
                        <div class="social-left">
                            <div class="social-icon-badge ${meta.class}">
                                ${meta.icon}
                            </div>
                            <div class="social-info">
                                <div class="social-platform-name">${meta.name}</div>
                                <div class="social-handle-text">${soc.handle}</div>
                                <div class="social-count-badge">${soc.followers}</div>
                            </div>
                        </div>
                        <div class="social-actions">
                            <a href="${soc.url}" target="_blank" rel="noopener" class="btn-social-link" title="Open Link">↗</a>
                            <button class="btn-social-delete" data-id="${soc.id}" title="Remove Account">&times;</button>
                        </div>
                    </div>
                `;
            }).join("");
        }

        if (statPlatformsCount) {
            statPlatformsCount.textContent = state.socials.length;
        }

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

            const newSocial = {
                id: "soc_" + Date.now(),
                userId: state.currentUser.id,
                platform: platform,
                name: meta.name,
                handle: handle,
                url: url,
                followers: followers,
                icon: meta.icon,
                class: meta.class
            };

            try {
                const saved = await api(`/api/socials`, { method: "POST", body: newSocial });
                state.socials.push(saved);
                renderSocials();
                modalAddSocial.classList.add("hidden");
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
                    <div class="post-author">
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
        btnCopyOutreach.addEventListener("click", () => {
            if (outreachTextBox) {
                navigator.clipboard.writeText(outreachTextBox.textContent);
                btnCopyOutreach.textContent = "Copied! ✓";
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

    const modalCreatorView = document.getElementById("modal-creator-view");
    const btnCloseCreatorView = document.getElementById("btn-close-creator-view");
    const viewCreatorAvatar = document.getElementById("view-creator-avatar");
    const viewCreatorName = document.getElementById("view-creator-name");
    const viewCreatorHandle = document.getElementById("view-creator-handle");
    const viewCreatorNiche = document.getElementById("view-creator-niche");
    const viewCreatorLocation = document.getElementById("view-creator-location");
    const viewCreatorFollowers = document.getElementById("view-creator-followers");
    const viewCreatorMatch = document.getElementById("view-creator-match");
    const viewCreatorBio = document.getElementById("view-creator-bio");
    const viewCreatorSocials = document.getElementById("view-creator-socials");
    const btnCreatorConnect = document.getElementById("btn-creator-connect");
    const btnCreatorMessage = document.getElementById("btn-creator-message");

    let currentOpenCreator = null;

    function openCreatorModal(creator) {
        if (!creator) return;
        currentOpenCreator = creator;

        if (viewCreatorAvatar) {
            viewCreatorAvatar.textContent = creator.avatar || creator.name.substring(0, 2).toUpperCase();
            viewCreatorAvatar.className = `creator-avatar ${creator.bgClass || 'avatar-purple'} profile-avatar-lg`;
        }
        if (viewCreatorName) viewCreatorName.textContent = creator.name;
        if (viewCreatorHandle) viewCreatorHandle.textContent = "@" + (creator.username || creator.name.toLowerCase().replace(/\s+/g, '_'));
        if (viewCreatorNiche) viewCreatorNiche.textContent = creator.niche || creator.category || "Creator";
        if (viewCreatorLocation) viewCreatorLocation.textContent = creator.location || "Worldwide";
        if (viewCreatorFollowers) viewCreatorFollowers.textContent = `${creator.followers || '10K'} followers`;
        if (viewCreatorMatch) viewCreatorMatch.textContent = `${creator.match || 85}%`;
        if (viewCreatorBio) viewCreatorBio.textContent = creator.bio || `${creator.name} is an active ${creator.niche || 'creator'} on Conexus sharing growth strategies & collabs.`;

        if (viewCreatorSocials) {
            viewCreatorSocials.innerHTML = `
                <span class="social-badge youtube">▶ YouTube (${creator.followers || '10K'})</span>
                <span class="social-badge instagram">📷 Instagram</span>
                <span class="social-badge twitch">👾 Twitch</span>
            `;
        }

        if (modalCreatorView) modalCreatorView.classList.remove("hidden");
    }

    if (btnCloseCreatorView && modalCreatorView) {
        btnCloseCreatorView.addEventListener("click", () => modalCreatorView.classList.add("hidden"));
    }

    if (btnCreatorConnect) {
        btnCreatorConnect.addEventListener("click", () => {
            const connected = btnCreatorConnect.classList.toggle("connected");
            btnCreatorConnect.textContent = connected ? "Requested" : "Connect";
        });
    }

    if (btnCreatorMessage) {
        btnCreatorMessage.addEventListener("click", async () => {
            if (!currentOpenCreator || !state.currentUser) return;
            if (modalCreatorView) modalCreatorView.classList.add("hidden");

            const creatorId = currentOpenCreator.id;
            if (!creatorId) return;

            try {
                // The server owns the thread id, so both participants end up
                // pointing at the same conversation.
                const thread = await api(
                    `/api/chats/with-creator?creatorId=${encodeURIComponent(creatorId)}`,
                    { method: "POST" }
                );
                state.chats[thread.id] = thread;

                renderInbox();
                switchView("view-messages");
                openChatThread(thread.id);
            } catch (err) {
                showToast(describeApiError(err, "Could not start this conversation."), "error");
            }
        });
    }

    document.addEventListener("click", (e) => {
        const creatorCard = e.target.closest(".creator-card");
        if (creatorCard && !e.target.closest(".connect-button") && !e.target.closest(".creator-more")) {
            const creatorId = creatorCard.getAttribute("data-creator-id");
            let creator = state.creators.find(c => c.id === creatorId);
            if (!creator) {
                const name = creatorCard.querySelector("h3")?.textContent || "Creator";
                const niche = creatorCard.querySelector(".creator-type")?.textContent || "Creator";
                const loc = creatorCard.querySelector(".creator-info")?.textContent || "Worldwide";
                const followers = creatorCard.querySelector(".creator-followers")?.textContent || "10K";
                const avatar = creatorCard.querySelector(".creator-avatar")?.textContent || "CR";
                const bgClass = creatorCard.querySelector(".creator-avatar")?.className || "avatar-purple";
                creator = { id: creatorId || "c_" + Date.now(), name, niche, location: loc, followers, avatar, bgClass, match: 88 };
            }
            openCreatorModal(creator);
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
            const comments = await api(`/api/comments?postId=${postId}`);
            renderCommentsList(comments.map(c => ({
                author: c.authorName,
                avatar: c.avatar,
                bgClass: c.bgClass,
                time: timeAgo(c.createdAt),
                text: c.text
            })));
        } catch (e) {
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

    function renderCommentsList(comments) {
        if (!postCommentsList) return;

        postCommentsList.innerHTML = comments.map(c => `
            <div class="comment-item">
                <div class="comment-avatar ${escapeHtml(c.bgClass)}">${escapeHtml(c.avatar)}</div>
                <div class="comment-body">
                    <div class="comment-header">
                        <strong>${escapeHtml(c.author)}</strong>
                        <span>${escapeHtml(c.time)}</span>
                    </div>
                    <p>${escapeHtml(c.text)}</p>
                </div>
            </div>
        `).join("");
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

                // Re-read the post so the stored comment count is what we show.
                const idx = state.posts.findIndex(p => String(p.id) === String(postId));
                if (idx !== -1) {
                    state.posts[idx].commentsCount = (state.posts[idx].commentsCount || 0) + 1;
                    renderFeed();
                    currentOpenPostCard = document.querySelector(`.inspo-card[data-post-id="${postId}"]`) || currentOpenPostCard;
                }

                await openPostCommentsModal(currentOpenPostCard);
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