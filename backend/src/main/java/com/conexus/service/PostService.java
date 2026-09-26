package com.conexus.service;

import com.conexus.model.Comment;
import com.conexus.model.Post;
import com.conexus.model.Notification;
import com.conexus.model.PostImage;
import com.conexus.model.PostLike;
import com.conexus.model.ProfileInfo;
import com.conexus.model.User;
import com.conexus.repository.CommentLikeRepository;
import com.conexus.repository.CommentRepository;
import com.conexus.repository.PostImageRepository;
import com.conexus.repository.PostLikeRepository;
import com.conexus.repository.PostRepository;
import com.conexus.repository.ProfileInfoRepository;
import com.conexus.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class PostService {

    private final PostRepository postRepository;
    private final PostLikeRepository postLikeRepository;
    private final PostImageRepository postImageRepository;
    private final CommentRepository commentRepository;
    private final CommentLikeRepository commentLikeRepository;
    private final UserRepository userRepository;
    private final ProfileInfoRepository profileInfoRepository;
    private final NotificationService notificationService;

    /**
     * Newest first, with each post's `liked` flag resolved for this viewer.
     * Pass a null userId for an anonymous read — nothing shows as liked.
     */
    public List<Post> getAll(Long userId) {
        List<Post> posts = postRepository.findAllByOrderByCreatedAtDesc();

        Set<Long> likedIds = userId == null
                ? new HashSet<>()
                : new HashSet<>(postLikeRepository.findPostIdsLikedBy(userId));

        posts.forEach(post -> post.setLiked(likedIds.contains(post.getId())));
        return posts;
    }

    /**
     * Publishes a post as this user. The byline and avatar come from the
     * account, so a request cannot post under someone else's name.
     */
    @Transactional
    public Post create(Long userId, String content, String niche, String imageDataUrl) {
        User author = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Sign in to continue"));

        DecodedImage image = imageDataUrl == null || imageDataUrl.isBlank() ? null : decodeImage(imageDataUrl);

        String name = profileInfoRepository.findByUserId(userId)
                .map(ProfileInfo::getDisplayName)
                .filter(n -> n != null && !n.isBlank())
                .orElseGet(() -> author.getDisplayName() != null ? author.getDisplayName() : author.getUsername());

        Post saved = postRepository.save(Post.builder()
                .authorId(userId)
                .authorName(name)
                .niche(niche != null && !niche.isBlank() ? niche : author.getNiche())
                .content(content == null ? "" : content.trim())
                .avatarClass(author.getBgClass() != null ? author.getBgClass() : "avatar-purple")
                .imageWidth(image == null ? null : image.width)
                .imageHeight(image == null ? null : image.height)
                .build());

        if (image != null) {
            postImageRepository.save(PostImage.builder()
                    .postId(saved.getId())
                    .contentType(image.contentType)
                    .data(image.bytes)
                    .build());
        }

        saved.setLiked(false);
        return saved;
    }

    /** Largest photo accepted, after the browser has already scaled it down. */
    public static final int MAX_IMAGE_BYTES = 3 * 1024 * 1024;

    private static final class DecodedImage {
        final byte[] bytes;
        final String contentType;
        final int width;
        final int height;

        DecodedImage(byte[] bytes, String contentType, int width, int height) {
            this.bytes = bytes;
            this.contentType = contentType;
            this.width = width;
            this.height = height;
        }
    }

    /**
     * Accepts a data: URL holding a JPEG or PNG. The bytes are actually decoded,
     * so a renamed file or a script dressed up as an image is refused, and the
     * real dimensions come from the image rather than from the request.
     */
    private DecodedImage decodeImage(String dataUrl) {
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("^data:(image/(?:jpeg|png));base64,(.+)$", java.util.regex.Pattern.DOTALL)
                .matcher(dataUrl);
        if (!m.matches()) {
            throw new IllegalArgumentException("Photos must be JPEG or PNG");
        }

        byte[] bytes;
        try {
            bytes = java.util.Base64.getDecoder().decode(m.group(2).trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("That photo could not be read");
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw new IllegalArgumentException("That photo is too large");
        }

        try (javax.imageio.stream.ImageInputStream in =
                     javax.imageio.ImageIO.createImageInputStream(new java.io.ByteArrayInputStream(bytes))) {
            java.util.Iterator<javax.imageio.ImageReader> readers = javax.imageio.ImageIO.getImageReaders(in);
            if (!readers.hasNext()) throw new IllegalArgumentException("That photo could not be read");

            javax.imageio.ImageReader reader = readers.next();
            try {
                reader.setInput(in);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                // Checked from the header before decoding: a tiny file can
                // declare a huge canvas and exhaust memory once expanded.
                if (width < 1 || height < 1 || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
                    throw new IllegalArgumentException("That photo's dimensions are too large");
                }
                reader.read(0);   // a full decode proves it really is an image
                return new DecodedImage(bytes, m.group(1), width, height);
            } finally {
                reader.dispose();
            }
        } catch (java.io.IOException e) {
            throw new IllegalArgumentException("That photo could not be read");
        }
    }

    private static final int MAX_IMAGE_SIDE = 6000;

    public java.util.Optional<PostImage> imageFor(Long postId) {
        return postImageRepository.findByPostId(postId);
    }

    /**
     * Toggles this user's like and recomputes the post's like count from the
     * actual rows, so the number always matches who really liked it.
     */
    @Transactional
    public Post toggleLike(Long postId, Long userId) {
        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new RuntimeException("Post not found: " + postId));

        boolean nowLiked = postLikeRepository.findByPostIdAndUserId(postId, userId)
                .map(existing -> {
                    postLikeRepository.delete(existing);
                    return false;
                })
                .orElseGet(() -> {
                    postLikeRepository.save(PostLike.builder().postId(postId).userId(userId).build());
                    return true;
                });

        postLikeRepository.flush();
        post.setLikesCount((int) postLikeRepository.countByPostId(postId));
        Post saved = postRepository.save(post);
        saved.setLiked(nowLiked);

        // Only on liking; unliking should not announce itself.
        if (nowLiked) {
            notificationService.notify(post.getAuthorId(), userId, NotificationService.POST_LIKE,
                    Notification.builder()
                            .postId(post.getId())
                            .excerpt(NotificationService.excerpt(post.getContent())));
        }

        return saved;
    }

    /** True only when this post exists and was written by the given user. */
    public boolean isAuthoredBy(Long postId, Long userId) {
        return postRepository.findById(postId)
                .map(post -> userId != null && userId.equals(post.getAuthorId()))
                .orElse(false);
    }

    /** Removes a post along with its comments and likes, which would otherwise be orphaned. */
    @Transactional
    public void delete(Long id) {
        for (Comment comment : commentRepository.findByPostIdOrderByCreatedAtAsc(id)) {
            commentLikeRepository.deleteByCommentId(comment.getId());
            commentRepository.delete(comment);
        }
        postLikeRepository.deleteByPostId(id);
        postImageRepository.deleteByPostId(id);
        postRepository.deleteById(id);
    }
}
