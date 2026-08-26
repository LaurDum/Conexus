package com.conexus.config;

import com.conexus.model.*;
import com.conexus.repository.*;
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
        seedUsers();
        seedCreators();
        seedPosts();
        seedPostLikes();
        syncPostLikeCounts();
        seedComments();
        syncPostCommentCounts();
        linkCreatorsToAccounts();
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
