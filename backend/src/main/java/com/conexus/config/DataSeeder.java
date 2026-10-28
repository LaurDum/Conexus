package com.conexus.config;

import com.conexus.auth.AuthService;
import com.conexus.chat.ChatThread;
import com.conexus.chat.ChatThreadRepository;
import com.conexus.network.Creator;
import com.conexus.network.CreatorRepository;
import com.conexus.opportunity.BrandDeal;
import com.conexus.opportunity.BrandDealRepository;
import com.conexus.opportunity.Job;
import com.conexus.opportunity.JobRepository;
import com.conexus.post.Comment;
import com.conexus.post.CommentRepository;
import com.conexus.post.Post;
import com.conexus.post.PostImage;
import com.conexus.post.PostImageRepository;
import com.conexus.post.PostLike;
import com.conexus.post.PostLikeRepository;
import com.conexus.post.PostRepository;
import com.conexus.social.SocialAccount;
import com.conexus.social.SocialAccountRepository;
import com.conexus.social.SocialAccountService;
import com.conexus.stats.ReachService;
import com.conexus.stats.ReachSnapshot;
import com.conexus.stats.ReachSnapshotRepository;
import com.conexus.user.User;
import com.conexus.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.stream.Collectors;

/**
 * Fills an empty database with the demo content in resources/demo/demo-data.json,
 * and keeps a few derived values in step on every start. Each part only runs
 * when its table is empty or its account is missing, so real data is never
 * touched.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DataSeeder implements CommandLineRunner {

    /** Every demo account signs in with this. */
    private static final String DEMO_PASSWORD = "test123";

    private final UserRepository userRepository;
    private final CreatorRepository creatorRepository;
    private final PostRepository postRepository;
    private final PostImageRepository postImageRepository;
    private final PostLikeRepository postLikeRepository;
    private final CommentRepository commentRepository;
    private final SocialAccountRepository socialAccountRepository;
    private final ChatThreadRepository chatThreadRepository;
    private final BrandDealRepository brandDealRepository;
    private final JobRepository jobRepository;
    private final ReachSnapshotRepository reachSnapshotRepository;
    private final ReachService reachService;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbc;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @Override
    public void run(String... args) {
        mergeProfileTable();
        hashLegacyPasswords();

        DemoData demo = loadDemoData();
        demo.accounts.forEach(this::seedAccount);
        seedIfEmpty(creatorRepository, demo.creators, "creator cards");
        seedIfEmpty(postRepository, demo.posts, "posts");
        seedPostLikes();
        seedComments(demo.comments);
        syncPostCounts();
        linkCreatorsToAccounts();
        linkDemoChats();
        seedIfEmpty(brandDealRepository, demo.brandDeals, "brand deals");
        seedIfEmpty(jobRepository, demo.jobs, "jobs");
        seedReachHistory(demo.accounts);
        seedPhotoPosts(demo.photoPosts);
    }

    // ── Demo content ───────────────────────────────────────────────────────

    /** The shape of demo-data.json. */
    static class DemoData {
        public List<Account> accounts = List.of();
        public List<Creator> creators = List.of();
        public List<Post> posts = List.of();
        public List<PhotoPost> photoPosts = List.of();
        public List<String> comments = List.of();
        public List<BrandDeal> brandDeals = List.of();
        public List<Job> jobs = List.of();
    }

    static class Account {
        public String username, email, displayName, handle, niche, category, location, followers,
                avatar, bgClass, bio, totalReach, engagement, accountType, goals;
        public List<SocialAccount> socials = List.of();
        public List<ChatThread> chats = List.of();
    }

    static class PhotoPost {
        public String author, niche, picture, content;
    }

    private DemoData loadDemoData() {
        try (InputStream in = new ClassPathResource("demo/demo-data.json").getInputStream()) {
            return objectMapper.readValue(in, DemoData.class);
        } catch (IOException e) {
            throw new IllegalStateException("Could not read demo/demo-data.json", e);
        }
    }

    private <T> void seedIfEmpty(org.springframework.data.jpa.repository.JpaRepository<T, ?> repo, List<T> rows, String what) {
        if (repo.count() > 0 || rows.isEmpty()) return;
        repo.saveAll(rows);
        log.info("Seeded {} {}", rows.size(), what);
    }

    /** One demo account with its linked platforms and conversations. */
    private void seedAccount(Account a) {
        if (userRepository.existsByUsername(a.username)) return;

        User user = userRepository.save(User.builder()
                .username(a.username)
                .email(a.email)
                .password(encoder.encode(DEMO_PASSWORD))
                .displayName(a.displayName)
                .handle(a.handle)
                .niche(a.niche)
                .category(a.category)
                .location(a.location)
                .followers(a.followers)
                .avatar(a.avatar)
                .bgClass(a.bgClass)
                .bio(a.bio)
                .totalReach(a.totalReach)
                .engagement(a.engagement)
                .accountType(a.accountType)
                .goals(a.goals)
                .onboardingComplete(true)
                .build());

        for (SocialAccount s : a.socials) {
            s.setUserId(user.getId());
            SocialAccountService.applyPlatformMeta(s);
        }
        socialAccountRepository.saveAll(a.socials);

        for (ChatThread chat : a.chats) {
            chat.setUserId(user.getId());
            chat.getMessages().forEach(m -> m.setThread(chat));
        }
        chatThreadRepository.saveAll(a.chats);

        log.info("Seeded demo account '{}'", a.username);
    }

    /**
     * Demo engagement: real accounts liking real posts, varied so the feed does
     * not look uniform. Nobody likes their own post. Only on an empty table.
     */
    private void seedPostLikes() {
        if (postLikeRepository.count() > 0) return;

        List<User> users = userRepository.findAll();
        int variation = 0;
        for (Post post : postRepository.findAll()) {
            List<User> candidates = othersThan(users, post);
            if (candidates.isEmpty()) continue;

            int howMany = Math.min(candidates.size(), 2 + (variation % 3));
            int offset = variation * 2;
            variation++;

            for (int i = 0; i < howMany; i++) {
                User liker = candidates.get((offset + i) % candidates.size());
                postLikeRepository.save(PostLike.builder().postId(post.getId()).userId(liker.getId()).build());
            }
        }
    }

    /** A couple of comments on each post nobody has replied to yet. */
    private void seedComments(List<String> lines) {
        if (lines.isEmpty()) return;

        List<User> users = userRepository.findAll();
        int variation = 0;
        for (Post post : postRepository.findAll()) {
            if (commentRepository.countByPostId(post.getId()) > 0) continue;

            List<User> candidates = othersThan(users, post);
            if (candidates.isEmpty()) continue;

            int howMany = Math.min(candidates.size(), 2 + (variation % 2));
            int offset = variation * 3;
            variation++;

            for (int i = 0; i < howMany; i++) {
                User author = candidates.get((offset + i) % candidates.size());
                commentRepository.save(Comment.builder()
                        .postId(post.getId())
                        .authorId(author.getId())
                        .authorName(author.publicName())
                        .avatar(author.getAvatar())
                        .bgClass(author.getBgClass())
                        .text(lines.get((offset + i) % lines.size()))
                        .build());
            }
        }
    }

    private static List<User> othersThan(List<User> users, Post post) {
        return users.stream()
                .filter(u -> post.getAuthorId() == null || !u.getId().equals(post.getAuthorId()))
                .collect(Collectors.toList());
    }

    /**
     * Photo posts from the demo creators. The pictures are drawn in code
     * (DemoImages). Runs once, on a database with no photos yet.
     */
    private void seedPhotoPosts(List<PhotoPost> photos) {
        if (postImageRepository.count() > 0) return;

        for (PhotoPost p : photos) {
            userRepository.findByUsername(p.author).ifPresent(user -> {
                Post post = postRepository.save(Post.builder()
                        .authorId(user.getId())
                        .authorName(user.publicName())
                        .niche(p.niche)
                        .content(p.content)
                        .avatarClass(user.getBgClass() != null ? user.getBgClass() : "avatar-purple")
                        .imageWidth(DemoImages.W)
                        .imageHeight(DemoImages.H)
                        .build());

                postImageRepository.save(PostImage.builder()
                        .postId(post.getId())
                        .contentType("image/jpeg")
                        .data(DemoImages.byName(p.picture))
                        .build());
            });
        }
        log.info("Seeded demo photo posts");
    }

    /**
     * 30 days of reach history for the demo accounts, so the Home graph has a
     * line to draw. It climbs gently to each account's current total, the same
     * shape every time (seeded by user id). Real accounts get no invented
     * history: theirs starts the first day they use the app.
     */
    private void seedReachHistory(List<Account> accounts) {
        for (Account a : accounts) {
            userRepository.findByUsername(a.username).ifPresent(user -> {
                if (reachSnapshotRepository.existsByUserId(user.getId())) return;

                long current = reachService.currentTotal(user.getId());
                if (current <= 0) return;

                Random random = new Random(user.getId() * 7919L);
                double startShare = 0.90 + random.nextDouble() * 0.06;
                LocalDate today = LocalDate.now();
                List<ReachSnapshot> rows = new ArrayList<>();

                for (int back = 30; back >= 1; back--) {
                    double progress = (30 - back) / 30.0;
                    double wobble = (random.nextDouble() - 0.35) * 0.006;
                    double share = Math.min(1.0, startShare + (1 - startShare) * Math.pow(progress, 1.3) + wobble);
                    rows.add(ReachSnapshot.builder()
                            .userId(user.getId())
                            .day(today.minusDays(back))
                            .total(Math.round(current * share / 100.0) * 100)
                            .build());
                }
                reachSnapshotRepository.saveAll(rows);
                reachService.record(user.getId());
            });
        }
    }

    // ── Kept in step on every start ────────────────────────────────────────

    /** Like and comment counts on each post always match the rows behind them. */
    private void syncPostCounts() {
        postRepository.findAll().forEach(post -> {
            int likes = (int) postLikeRepository.countByPostId(post.getId());
            int comments = (int) commentRepository.countByPostId(post.getId());
            if (post.getLikesCount() != likes || post.getCommentsCount() != comments) {
                post.setLikesCount(likes);
                post.setCommentsCount(comments);
                postRepository.save(post);
            }
        });
    }

    /**
     * Points each discover card at the account of the same name, where one
     * exists, so connecting with or messaging a card reaches a real person.
     */
    /**
     * The demo conversations were written against a name, not an account, so
     * they could not deliver a reply and sat beside the real thread with the
     * same person. Where the name belongs to an account, fold the demo
     * messages into that real thread. Safe to run on every start.
     */
    private void linkDemoChats() {
        List<User> users = userRepository.findAll();
        int linked = 0;

        for (ChatThread demo : chatThreadRepository.findAll()) {
            if (demo.getPartnerUserId() != null || demo.getUserId() == null) continue;

            User partner = users.stream()
                    .filter(u -> !u.getId().equals(demo.getUserId()))
                    .filter(u -> u.publicName().equalsIgnoreCase(demo.getName()))
                    .findFirst().orElse(null);
            if (partner == null) continue;

            String realId = "chat_u" + demo.getUserId() + "_u" + partner.getId();
            if (realId.equals(demo.getId())) continue;

            if (!chatThreadRepository.existsById(realId)) {
                chatThreadRepository.save(ChatThread.builder()
                        .id(realId)
                        .userId(demo.getUserId())
                        .partnerUserId(partner.getId())
                        .name(partner.publicName())
                        .avatar(partner.getAvatar())
                        .bgClass(partner.getBgClass())
                        .status(partner.getNiche())
                        .snippet(demo.getSnippet())
                        .time(demo.getTime())
                        .unread(demo.isUnread())
                        .updatedAt(demo.getUpdatedAt())
                        .build());
            }

            // Moved rather than copied, so they keep their ids and stay ahead
            // of anything said in the real thread since.
            jdbc.update("UPDATE chat_messages SET thread_id = ? WHERE thread_id = ?", realId, demo.getId());
            jdbc.update("UPDATE notifications SET thread_id = ? WHERE thread_id = ?", realId, demo.getId());
            jdbc.update("DELETE FROM chat_threads WHERE id = ?", demo.getId());
            linked++;
        }
        if (linked > 0) log.info("Linked {} demo conversation(s) to real accounts", linked);
    }

    private void linkCreatorsToAccounts() {
        creatorRepository.findAll().stream()
                .filter(creator -> creator.getUserId() == null)
                .forEach(creator -> {
                    List<User> matches = userRepository.findByDisplayNameIgnoreCase(creator.getName());
                    if (matches.size() == 1) {
                        creator.setUserId(matches.get(0).getId());
                        creatorRepository.save(creator);
                    }
                });
    }

    /** Replaces any password still stored as plain text with a BCrypt hash. */
    private void hashLegacyPasswords() {
        List<User> legacy = userRepository.findAll().stream()
                .filter(u -> u.getPassword() != null && !AuthService.isBcryptHash(u.getPassword()))
                .collect(Collectors.toList());
        if (legacy.isEmpty()) return;

        legacy.forEach(u -> u.setPassword(encoder.encode(u.getPassword())));
        userRepository.saveAll(legacy);
        log.info("Hashed {} plain-text password(s)", legacy.size());
    }

    /**
     * One-time move: profiles used to live in their own table next to users,
     * duplicating name, bio and location. Copies what people edited there into
     * their user row, then renames the old table so this never runs twice. The
     * renamed table is kept, not dropped, in case anything needs checking.
     */
    private void mergeProfileTable() {
        Boolean present = jdbc.queryForObject("SELECT to_regclass('public.profile_info') IS NOT NULL", Boolean.class);
        if (!Boolean.TRUE.equals(present)) return;

        int merged = jdbc.update(
                "UPDATE users u SET"
                + " display_name = COALESCE(NULLIF(p.display_name, ''), u.display_name),"
                + " handle       = COALESCE(NULLIF(p.handle, ''), u.handle),"
                + " bio          = COALESCE(NULLIF(p.bio, ''), u.bio),"
                + " location     = COALESCE(NULLIF(p.location, ''), u.location),"
                + " total_reach  = COALESCE(NULLIF(p.total_reach, ''), u.total_reach),"
                + " engagement   = COALESCE(NULLIF(p.engagement, ''), u.engagement)"
                + " FROM profile_info p WHERE p.user_id = u.id");
        jdbc.execute("ALTER TABLE profile_info RENAME TO profile_info_merged");
        log.info("Moved {} profile(s) into users; the old table is kept as profile_info_merged", merged);
    }
}
