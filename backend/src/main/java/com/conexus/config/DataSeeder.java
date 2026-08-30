package com.conexus.config;

import com.conexus.model.*;
import com.conexus.repository.*;
import com.conexus.service.AuthService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Seeds the database with trial accounts, creators, posts, and per-user data on startup.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DataSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final CreatorRepository creatorRepository;
    private final PostRepository postRepository;
    private final SocialAccountRepository socialAccountRepository;
    private final ProfileInfoRepository profileInfoRepository;
    private final ChatThreadRepository chatThreadRepository;
    private final PostLikeRepository postLikeRepository;
    private final CommentRepository commentRepository;
    private final BrandDealRepository brandDealRepository;
    private final JobRepository jobRepository;

    /**
     * Replies that read naturally under any creator post, so the demo feed has
     * real conversations without inventing content about a specific topic.
     */
    private static final List<String> DEMO_COMMENTS = Arrays.asList(
            "This is genuinely useful, thanks for sharing!",
            "Saving this one for later 👀",
            "Would love a deeper breakdown of this.",
            "Great timing — I was just looking into this myself.",
            "Following for more of these 🙌",
            "Solid work. How long did this take you?",
            "Commenting so I can find this again later.",
            "This deserves way more attention.",
            "Exactly the kind of post I joined Conexus for.",
            "Tried something similar last month — happy to compare notes!"
    );

    @Override
    public void run(String... args) {
        hashLegacyPasswords();
        seedUsers();
        seedCreators();
        seedCreatorAccounts();
        seedPosts();
        seedPostLikes();
        syncPostLikeCounts();
        seedComments();
        syncPostCommentCounts();
        linkCreatorsToAccounts();
        seedBrandDeals();
        seedJobs();
    }

    /**
     * Gives the demo feed some genuine engagement: real accounts liking real
     * posts. Every like is a row in post_likes owned by an account, so the
     * counts are truthful and each demo user sees their own likes hearted.
     * Only runs on a database that has no likes yet.
     */
    private void seedPostLikes() {
        if (postLikeRepository.count() > 0) return;

        List<User> users = userRepository.findAll();
        List<Post> posts = postRepository.findAll();
        if (users.isEmpty() || posts.isEmpty()) return;

        log.info("Seeding demo post likes from {} accounts...", users.size());

        int variation = 0;
        for (Post post : posts) {
            // Nobody likes their own post.
            List<User> candidates = users.stream()
                    .filter(u -> post.getAuthorId() == null || !u.getId().equals(post.getAuthorId()))
                    .collect(Collectors.toList());
            if (candidates.isEmpty()) continue;

            // Vary both how many accounts liked each post and which ones, so the
            // feed does not look uniform and every demo account has a different
            // set of posts already hearted when they sign in.
            int howMany = Math.min(candidates.size(), 2 + (variation % 3));
            int offset = variation * 2;
            variation++;

            for (int i = 0; i < howMany; i++) {
                User liker = candidates.get((offset + i) % candidates.size());
                postLikeRepository.save(PostLike.builder()
                        .postId(post.getId())
                        .userId(liker.getId())
                        .build());
            }
        }
    }

    /**
     * Gives posts that nobody has replied to yet a couple of real comments from
     * real accounts. Posts that already have a conversation are left untouched.
     */
    private void seedComments() {
        List<User> users = userRepository.findAll();
        if (users.isEmpty()) return;

        int variation = 0;
        for (Post post : postRepository.findAll()) {
            if (commentRepository.countByPostId(post.getId()) > 0) continue;

            List<User> candidates = users.stream()
                    .filter(u -> post.getAuthorId() == null || !u.getId().equals(post.getAuthorId()))
                    .collect(Collectors.toList());
            if (candidates.isEmpty()) continue;

            int howMany = Math.min(candidates.size(), 2 + (variation % 2));
            int offset = variation * 3;
            variation++;

            for (int i = 0; i < howMany; i++) {
                User author = candidates.get((offset + i) % candidates.size());
                commentRepository.save(Comment.builder()
                        .postId(post.getId())
                        .authorId(author.getId())
                        .authorName(author.getDisplayName())
                        .avatar(author.getAvatar())
                        .bgClass(author.getBgClass())
                        .text(DEMO_COMMENTS.get((offset + i) % DEMO_COMMENTS.size()))
                        .build());
            }
            log.info("Seeded demo comments on post {}", post.getId());
        }
    }

    /** Keeps posts.comments_count equal to the number of rows in comments. */
    private void syncPostCommentCounts() {
        postRepository.findAll().forEach(post -> {
            int actual = (int) commentRepository.countByPostId(post.getId());
            if (post.getCommentsCount() != actual) {
                post.setCommentsCount(actual);
                postRepository.save(post);
            }
        });
    }

    /**
     * Keeps posts.likes_count equal to the number of rows in post_likes. Guards
     * against counts left over from when likes were a single global boolean.
     */
    private void syncPostLikeCounts() {
        postRepository.findAll().forEach(post -> {
            int actual = (int) postLikeRepository.countByPostId(post.getId());
            if (post.getLikesCount() != actual) {
                post.setLikesCount(actual);
                postRepository.save(post);
            }
        });
    }

    /**
     * Points each discover card at the account of the same name, where one
     * exists. Without this link a message sent to a creator card has no
     * account to be delivered to, so the recipient never sees it.
     * Runs every startup so cards created before an account still get linked.
     */
    private void linkCreatorsToAccounts() {
        creatorRepository.findAll().stream()
                .filter(creator -> creator.getUserId() == null)
                .forEach(creator -> {
                    List<User> matches = userRepository.findByDisplayNameIgnoreCase(creator.getName());
                    if (matches.size() == 1) {
                        creator.setUserId(matches.get(0).getId());
                        creatorRepository.save(creator);
                        log.info("Linked creator '{}' to account '{}'", creator.getId(), matches.get(0).getUsername());
                    }
                });
    }

    /**
     * Replaces any password still stored as plain text with a BCrypt hash.
     *
     * Passwords were originally saved verbatim, so anyone able to read the
     * users table could read real passwords — which people reuse elsewhere.
     * Runs on every startup and is a no-op once everything is hashed.
     */
    private void hashLegacyPasswords() {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

        List<User> legacy = userRepository.findAll().stream()
                .filter(u -> u.getPassword() != null && !AuthService.isBcryptHash(u.getPassword()))
                .collect(Collectors.toList());

        if (legacy.isEmpty()) return;

        legacy.forEach(u -> u.setPassword(encoder.encode(u.getPassword())));
        userRepository.saveAll(legacy);
        log.info("Hashed {} plain-text password(s)", legacy.size());
    }

    private void seedUsers() {
        if (!userRepository.existsByUsername("alex_creates")) {
            log.info("Seeding trial user accounts...");

            // Trial Account 1: Creator
            User alex = userRepository.save(User.builder()
                    .username("alex_creates")
                    .email("alex@test.com")
                    .password("test123")
                    .displayName("Alex Popescu")
                    .niche("Gaming Creator")
                    .category("Gaming")
                    .location("Bucharest, Romania")
                    .followers("24.5K")
                    .avatar("AP")
                    .bgClass("avatar-purple")
                    .bio("Gaming creator & reviewer from Bucharest! Loving strategy & action titles 🎮")
                    .totalReach("24.5K")
                    .engagement("5.2%")
                    .accountType("creator")
                    .goals("Grow my audience, Find collaborations")
                    .onboardingComplete(true)
                    .build());

            // ProfileInfo for Alex
            profileInfoRepository.save(ProfileInfo.builder()
                    .userId(alex.getId())
                    .displayName(alex.getDisplayName())
                    .handle("@alex_creates")
                    .bio(alex.getBio())
                    .location(alex.getLocation())
                    .totalReach("24.5K")
                    .engagement("5.2%")
                    .build());

            // Socials for Alex
            socialAccountRepository.saveAll(Arrays.asList(
                SocialAccount.builder().id("soc_alex_1").userId(alex.getId()).platform("youtube").name("YouTube").handle("@alexgaming").url("https://youtube.com/@alexgaming").followers("18.2K").icon("▶").cssClass("platform-youtube").build(),
                SocialAccount.builder().id("soc_alex_2").userId(alex.getId()).platform("twitch").name("Twitch").handle("alex_live").url("https://twitch.tv/alex_live").followers("6.3K").icon("👾").cssClass("platform-twitch").build()
            ));

            // Chats for Alex
            ChatThread chat1 = ChatThread.builder()
                    .id("chat_alex_elena")
                    .userId(alex.getId())
                    .name("Elena M.")
                    .avatar("EM")
                    .bgClass("avatar-green")
                    .status("Tech & AI Creator · Germany")
                    .snippet("That stream setup breakdown was super clean! Let's collab soon.")
                    .time("2h ago")
                    .unread(true)
                    .build();
            chat1.getMessages().add(ChatMessage.builder().sender("them").text("Hey Alex! Loved your stream last night.").time("02:14 PM").thread(chat1).build());
            chat1.getMessages().add(ChatMessage.builder().sender("them").text("That stream setup breakdown was super clean! Let's collab soon.").time("02:15 PM").thread(chat1).build());

            ChatThread chat2 = ChatThread.builder()
                    .id("chat_alex_ioana")
                    .userId(alex.getId())
                    .name("Ioana R.")
                    .avatar("IR")
                    .bgClass("avatar-blue")
                    .status("Travel Creator · Romania")
                    .snippet("Thanks for the gaming chair recommendations!")
                    .time("Yesterday")
                    .unread(false)
                    .build();
            chat2.getMessages().add(ChatMessage.builder().sender("me").text("Hey Ioana! Did you get a chance to check out that ergonomic setup?").time("Yesterday").thread(chat2).build());
            chat2.getMessages().add(ChatMessage.builder().sender("them").text("Thanks for the gaming chair recommendations! Super helpful.").time("Yesterday").thread(chat2).build());

            chatThreadRepository.saveAll(Arrays.asList(chat1, chat2));

            // Trial Account 2: Business
            User brand = userRepository.save(User.builder()
                    .username("brand_techgear")
                    .email("brand@test.com")
                    .password("test123")
                    .displayName("TechGear Pro")
                    .niche("Brand Partner")
                    .category("Tech")
                    .location("Worldwide")
                    .followers("150K")
                    .avatar("TG")
                    .bgClass("avatar-orange")
                    .bio("Leading consumer audio & tech hardware brand looking for creator partnerships!")
                    .totalReach("500K")
                    .engagement("3.8%")
                    .accountType("business")
                    .goals("Promote my brand, Discover talent")
                    .onboardingComplete(true)
                    .build());

            // ProfileInfo for Brand
            profileInfoRepository.save(ProfileInfo.builder()
                    .userId(brand.getId())
                    .displayName(brand.getDisplayName())
                    .handle("@techgear_pro")
                    .bio(brand.getBio())
                    .location(brand.getLocation())
                    .totalReach("500K")
                    .engagement("3.8%")
                    .build());

            // Socials for Brand
            socialAccountRepository.saveAll(Arrays.asList(
                SocialAccount.builder().id("soc_brand_1").userId(brand.getId()).platform("website").name("Website").handle("techgearpro.com").url("https://techgearpro.com").followers("100K/mo").icon("🌐").cssClass("platform-website").build(),
                SocialAccount.builder().id("soc_brand_2").userId(brand.getId()).platform("twitter").name("X (Twitter)").handle("@techgearpro").url("https://x.com/techgearpro").followers("50K").icon("𝕏").cssClass("platform-twitter").build()
            ));

            // Chats for Brand
            ChatThread brandChat1 = ChatThread.builder()
                    .id("chat_brand_alex")
                    .userId(brand.getId())
                    .name("Alex Popescu")
                    .avatar("AP")
                    .bgClass("avatar-purple")
                    .status("Gaming Creator · Romania")
                    .snippet("Hi Alex, we loved your channel metrics and would like to propose a sponsorship!")
                    .time("3 days ago")
                    .unread(false)
                    .build();
            brandChat1.getMessages().add(ChatMessage.builder().sender("me").text("Hi Alex, we loved your channel metrics and would like to propose a sponsorship for Q4!").time("3 days ago").thread(brandChat1).build());

            chatThreadRepository.save(brandChat1);
        }
    }

    /**
     * Gives the discover cards real accounts.
     *
     * These creators existed only as catalog rows, so connecting with them or
     * messaging them reached nobody. Each now has an account with a profile and
     * linked channels, which linkCreatorsToAccounts() attaches to its card by
     * display name. They also give the paginated Discover list enough people to
     * page through.
     *
     * All use the same password as the other trial accounts: test123
     */
    private void seedCreatorAccounts() {
        seedCreatorAccount("elena_ai", "elena@test.com", "Elena M.", "Tech & AI Creator", "Tech",
                "Germany", "92K", "EM", "avatar-green",
                "AI and consumer tech, explained without the hype. Weekly deep dives.",
                "92K", "6.1%",
                new String[][] {
                    {"youtube", "@elenaexplains", "61K"},
                    {"substack", "elenaonai", "18K"}
                });

        seedCreatorAccount("maria_travels", "maria@test.com", "Maria Stoica", "Travel Creator", "Travel",
                "Romania", "58K", "MS", "avatar-blue",
                "Slow travel across Europe by train. Currently somewhere between Cluj and Lisbon.",
                "58K", "4.4%",
                new String[][] {
                    {"instagram", "@mariastoica", "38K"},
                    {"tiktok", "@mariatravels", "20K"}
                });

        seedCreatorAccount("david_sound", "david@test.com", "David V.", "Music Creator", "Music",
                "United Kingdom", "41K", "DV", "avatar-orange",
                "Producer and sound designer. Breaking down how records actually get made.",
                "41K", "5.7%",
                new String[][] {
                    {"spotify", "davidv", "24K"},
                    {"youtube", "@davidvsound", "17K"}
                });

        seedCreatorAccount("marcus_reviews", "marcus@test.com", "Marcus Chen", "Tech Reviewer", "Tech",
                "United States", "115K", "MC", "avatar-blue",
                "Hardware reviews with actual measurements. No sponsorships on review units.",
                "115K", "3.9%",
                new String[][] {
                    {"youtube", "@marcuschen", "98K"},
                    {"twitter", "@marcusreviews", "17K"}
                });

        seedCreatorAccount("lucas_silva", "lucas@test.com", "Lucas Silva", "Food & Culinary", "Food",
                "Brazil", "83K", "LS", "avatar-green",
                "Home cooking from São Paulo. Recipes you can actually finish on a weeknight.",
                "83K", "6.8%",
                new String[][] {
                    {"youtube", "@lucascooks", "55K"},
                    {"instagram", "@lucassilva", "28K"}
                });

        seedCreatorAccount("sophia_rossi", "sophia@test.com", "Sophia Rossi", "Fashion Creator", "Fashion",
                "Italy", "67K", "SR", "avatar-orange",
                "Independent labels and second-hand finds from Milan. Style over trends.",
                "67K", "5.3%",
                new String[][] {
                    {"instagram", "@sophiarossi", "52K"},
                    {"tiktok", "@sophiastyle", "15K"}
                });
    }

    private void seedCreatorAccount(String username, String email, String displayName, String niche,
                                    String category, String location, String followers, String avatar,
                                    String bgClass, String bio, String reach, String engagement,
                                    String[][] socials) {
        if (userRepository.existsByUsername(username)) return;

        User user = userRepository.save(User.builder()
                .username(username)
                .email(email)
                .password(new BCryptPasswordEncoder().encode("test123"))
                .displayName(displayName)
                .niche(niche)
                .category(category)
                .location(location)
                .followers(followers)
                .avatar(avatar)
                .bgClass(bgClass)
                .bio(bio)
                .totalReach(reach)
                .engagement(engagement)
                .accountType("creator")
                .onboardingComplete(true)
                .build());

        profileInfoRepository.save(ProfileInfo.builder()
                .userId(user.getId())
                .displayName(displayName)
                .handle("@" + username)
                .bio(bio)
                .location(location)
                .totalReach(reach)
                .engagement(engagement)
                .build());

        for (String[] soc : socials) {
            String platform = soc[0];
            socialAccountRepository.save(SocialAccount.builder()
                    .id("soc_" + username + "_" + platform)
                    .userId(user.getId())
                    .platform(platform)
                    .name(platform.substring(0, 1).toUpperCase() + platform.substring(1))
                    .handle(soc[1])
                    .url("https://" + platform + ".com/" + soc[1].replace("@", ""))
                    .followers(soc[2])
                    .icon(getPlatformIcon(platform))
                    .cssClass("platform-" + platform)
                    .build());
        }

        log.info("Seeded creator account '{}'", username);
    }

    private String getPlatformIcon(String platform) {
        switch (platform) {
            case "youtube":   return "▶";
            case "tiktok":    return "🎵";
            case "instagram": return "📷";
            case "twitch":    return "👾";
            case "twitter":   return "𝕏";
            case "spotify":   return "🎧";
            case "substack":  return "📰";
            case "linkedin":  return "💼";
            default:          return "🌐";
        }
    }

    /**
     * Campaigns for the brand matching page. The Strategy view previously held
     * two of these as fixed markup, so there was nothing to "see all" of and no
     * way to filter.
     */
    private void seedBrandDeals() {
        if (brandDealRepository.count() > 0) return;

        log.info("Seeding brand deals...");
        brandDealRepository.saveAll(Arrays.asList(
            deal("bd_techgear", "TechGear Pro", "TG", "logo-tech", "Consumer Tech & Audio", "Tech",
                 "Product Review", "Looking for tech creators for hands-on reviews of wireless studio headsets.",
                 "$800 - $1,500", 94),
            deal("bd_wanderlust", "Wanderlust Escapes", "WL", "logo-travel", "Travel & Digital Nomad", "Travel",
                 "Sponsored Video", "Sponsoring travel creators testing portable power setups on remote trips.",
                 "$1,200 + Stay", 88),
            deal("bd_pixelforge", "PixelForge", "PF", "logo-gaming", "PC Components & Peripherals", "Gaming",
                 "Sponsored Video", "Seeking gaming creators to feature a new low-latency mechanical keyboard.",
                 "$600 - $1,100", 91),
            deal("bd_northaudio", "North Audio", "NA", "logo-tech", "Studio & Podcast Gear", "Tech",
                 "Brand Ambassador", "Six month ambassador programme for creators who record their own audio.",
                 "$2,000 / quarter", 86),
            deal("bd_verdant", "Verdant Kitchen", "VK", "logo-food", "Meal Kits & Groceries", "Food",
                 "Affiliate", "Recurring commission on meal kit referrals, no exclusivity required.",
                 "15% per referral", 78),
            deal("bd_atlaswear", "Atlas Wear", "AW", "logo-fashion", "Sustainable Apparel", "Fashion",
                 "Social Post", "Three post campaign featuring the autumn range, shot in your own style.",
                 "$450 per post", 82),
            deal("bd_lumen", "Lumen Studios", "LS", "logo-tech", "Lighting & Streaming", "Tech",
                 "Product Review", "Send-and-keep review of a key light aimed at small home studios.",
                 "Product + $300", 84),
            deal("bd_trailhead", "Trailhead Co.", "TH", "logo-travel", "Outdoor Equipment", "Travel",
                 "Affiliate", "Affiliate partnership for hiking and camping gear, tiered commission.",
                 "10 - 18% tiered", 74),
            deal("bd_soundwave", "Soundwave Collective", "SC", "logo-music", "Music Production Tools", "Music",
                 "Sponsored Video", "Walkthrough of a sample library aimed at producers and beatmakers.",
                 "$700 - $1,300", 89),
            deal("bd_novacon", "NovaCon", "NC", "logo-gaming", "Gaming Convention", "Gaming",
                 "Event", "Covering the creator stage at this year's convention, travel included.",
                 "$1,500 + Travel", 80),
            deal("bd_brightbrew", "Bright Brew", "BB", "logo-food", "Specialty Coffee", "Food",
                 "Social Post", "Morning routine feature for a single origin subscription launch.",
                 "$350 per post", 71),
            deal("bd_orbitvpn", "Orbit", "OR", "logo-tech", "Privacy & Security", "Tech",
                 "Affiliate", "Long running affiliate deal with a recurring share of each subscription.",
                 "30% recurring", 76),
            deal("bd_studioloft", "Studio Loft", "SL", "logo-fashion", "Creator Workspaces", "Fashion",
                 "Brand Ambassador", "Year long ambassador role for creators filming in shared studios.",
                 "$1,800 / quarter", 69),
            deal("bd_cadence", "Cadence Records", "CR", "logo-music", "Independent Label", "Music",
                 "Event", "Live session slot at a showcase night, with footage rights retained by you.",
                 "$900 + Travel", 73)
        ));
    }

    /** Roles for the Jobs section and its page. */
    private void seedJobs() {
        if (jobRepository.count() > 0) return;

        log.info("Seeding jobs...");
        jobRepository.saveAll(Arrays.asList(
            job("job_editor_pixel", "Short-Form Video Editor", "PixelForge", "PF", "logo-gaming",
                "Remote", "Contract", "Gaming", true,
                "Cut weekly gaming shorts from long-form streams. Roughly 6 clips a week.",
                "$35 / hr", "2 days ago"),
            job("job_thumb_nova", "Thumbnail Designer", "NovaCon", "NC", "logo-gaming",
                "Remote", "Freelance", "Gaming", true,
                "Design click-worthy thumbnails for event recap videos. Portfolio required.",
                "$120 per set", "4 days ago"),
            job("job_social_atlas", "Social Media Manager", "Atlas Wear", "AW", "logo-fashion",
                "Milan, Italy", "Full-time", "Fashion", false,
                "Own the brand's short-form presence across Instagram and TikTok.",
                "€38,000 / yr", "1 week ago"),
            job("job_podcast_north", "Podcast Producer", "North Audio", "NA", "logo-tech",
                "Remote", "Part-time", "Tech", true,
                "Produce and edit a weekly interview show. Audio-first, video optional.",
                "$1,800 / month", "3 days ago"),
            job("job_writer_orbit", "Technical Writer", "Orbit", "OR", "logo-tech",
                "Remote", "Contract", "Tech", true,
                "Write plain-English explainers about privacy tooling for a general audience.",
                "$45 / hr", "5 days ago"),
            job("job_camera_trail", "Camera Operator", "Trailhead Co.", "TH", "logo-travel",
                "Lisbon, Portugal", "Freelance", "Travel", false,
                "Two week shoot covering a hiking route. Own kit preferred, travel covered.",
                "$500 / day", "1 day ago"),
            job("job_producer_cadence", "Session Producer", "Cadence Records", "CR", "logo-music",
                "London, UK", "Contract", "Music", false,
                "Run live session recordings for emerging artists, two nights a month.",
                "£320 / session", "6 days ago"),
            job("job_community_verdant", "Community Manager", "Verdant Kitchen", "VK", "logo-food",
                "Remote", "Full-time", "Food", true,
                "Grow and moderate a recipe-sharing community across Discord and Reddit.",
                "$52,000 / yr", "2 weeks ago"),
            job("job_intern_lumen", "Content Intern", "Lumen Studios", "LS", "logo-tech",
                "Berlin, Germany", "Internship", "Tech", false,
                "Six month placement supporting the studio's own channel. Mentorship included.",
                "€1,400 / month", "1 week ago"),
            job("job_strategist_bright", "Content Strategist", "Bright Brew", "BB", "logo-food",
                "Remote", "Part-time", "Food", true,
                "Plan a quarterly content calendar around seasonal coffee launches.",
                "$1,100 / month", "3 days ago")
        ));
    }

    private Job job(String id, String title, String company, String logo, String logoClass,
                    String location, String jobType, String category, boolean remote,
                    String description, String pay, String postedAgo) {
        return Job.builder()
                .id(id).title(title).company(company).logo(logo).logoClass(logoClass)
                .location(location).jobType(jobType).category(category).remote(remote)
                .description(description).pay(pay).postedAgo(postedAgo).build();
    }

    private BrandDeal deal(String id, String brand, String logo, String logoClass, String industry,
                           String category, String dealType, String description, String pay, int match) {
        return BrandDeal.builder()
                .id(id).brandName(brand).logo(logo).logoClass(logoClass).industry(industry)
                .category(category).dealType(dealType).description(description).pay(pay)
                .matchScore(match).build();
    }

    private void seedCreators() {
        if (creatorRepository.count() == 0) {
            log.info("Seeding discover creators...");
            creatorRepository.saveAll(Arrays.asList(
                Creator.builder().id("alex").name("Alex Popescu").niche("Gaming Creator").category("Gaming").location("🇷🇴 Romania").followers("24K").matchScore(87).avatar("AP").bgClass("avatar-purple").build(),
                Creator.builder().id("maria").name("Maria Stoica").niche("Travel Creator").category("Travel").location("🇷🇴 Romania").followers("58K").matchScore(81).avatar("MS").bgClass("avatar-blue").build(),
                Creator.builder().id("david").name("David V.").niche("Music Creator").category("Music").location("🇬🇧 United Kingdom").followers("41K").matchScore(76).avatar("DV").bgClass("avatar-orange").build(),
                Creator.builder().id("elena").name("Elena M.").niche("Tech & AI Creator").category("Tech").location("🇩🇪 Germany").followers("92K").matchScore(94).avatar("EM").bgClass("avatar-green").build(),
                Creator.builder().id("marcus").name("Marcus Chen").niche("Tech Reviewer").category("Tech").location("🇺🇸 United States").followers("115K").matchScore(89).avatar("MC").bgClass("avatar-blue").build(),
                Creator.builder().id("sophia").name("Sophia Rossi").niche("Fashion Creator").category("Fashion").location("🇮🇹 Italy").followers("67K").matchScore(72).avatar("SR").bgClass("avatar-orange").build(),
                Creator.builder().id("lucas").name("Lucas Silva").niche("Food & Culinary").category("Food").location("🇧🇷 Brazil").followers("83K").matchScore(68).avatar("LS").bgClass("avatar-green").build()
            ));
        }
    }

    private void seedPosts() {
        if (postRepository.count() == 0) {
            log.info("Seeding public posts...");
            postRepository.saveAll(Arrays.asList(
                Post.builder().authorName("Ioana R.").niche("Travel Creator").content("Anyone going to Tokyo in November? Would love to connect with other travel creators while I'm there! 🇯🇵").likesCount(0).commentsCount(0).avatarClass("avatar-green").build(),
                Post.builder().authorName("Andrei D.").niche("Tech Creator").content("Just tested a completely different format for my short-form videos and the retention is insane (+40%). Thinking of publishing a breakdown soon! 📈").likesCount(0).commentsCount(0).avatarClass("avatar-purple").build(),
                Post.builder().authorName("Alex Popescu").niche("Gaming Creator").content("Setting up the new dual stream gear today! What games do you want to see reviewed this week? 🎮🎧").likesCount(0).commentsCount(0).avatarClass("avatar-purple").build()
            ));
        }
    }
}
