package com.conexus.service;

import com.conexus.model.ChatMessage;
import com.conexus.model.ChatThread;
import com.conexus.model.Creator;
import com.conexus.model.Notification;
import com.conexus.model.ProfileInfo;
import com.conexus.model.User;
import com.conexus.repository.ChatThreadRepository;
import com.conexus.repository.ProfileInfoRepository;
import com.conexus.repository.CreatorRepository;
import com.conexus.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatThreadRepository chatThreadRepository;
    private final CreatorRepository creatorRepository;
    private final UserRepository userRepository;
    private final ProfileInfoRepository profileInfoRepository;
    private final NotificationService notificationService;

    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("hh:mm a");

    /**
     * The name a user is known by. Prefers what they set on their profile, which
     * is what the rest of the app shows — otherwise a conversation header can
     * disagree with the profile it links to.
     */
    private String displayNameOf(User user) {
        if (user == null) return "Conexus Creator";

        return profileInfoRepository.findByUserId(user.getId())
                .map(ProfileInfo::getDisplayName)
                .filter(name -> name != null && !name.isBlank())
                .orElseGet(() -> user.getDisplayName() != null ? user.getDisplayName() : user.getUsername());
    }

    public List<ChatThread> getAllThreads() {
        return chatThreadRepository.findAll();
    }

    public List<ChatThread> getThreadsForUser(Long userId) {
        if (userId == null) return getAllThreads();
        return chatThreadRepository.findByUserId(userId);
    }

    /** True only when this thread belongs to the given user's inbox. */
    public boolean isOwnedBy(ChatThread thread, Long userId) {
        return thread != null && userId != null && userId.equals(thread.getUserId());
    }

    public ChatThread getThread(String id) {
        return chatThreadRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Thread not found: " + id));
    }

    /**
     * A conversation is stored as one thread row per participant, so each side
     * keeps its own unread flag and its own view of who it is talking to. This
     * builds the id of one side's copy.
     */
    private String threadIdFor(Long ownerId, Long partnerUserId, String partnerCreatorId) {
        return partnerUserId != null
                ? "chat_u" + ownerId + "_u" + partnerUserId
                : "chat_u" + ownerId + "_c" + partnerCreatorId;
    }

    @Transactional
    public ChatThread createOrGetThread(ChatThread incoming) {
        return chatThreadRepository.findById(incoming.getId())
                .orElseGet(() -> chatThreadRepository.save(incoming));
    }

    /**
     * Opens (or reuses) the caller's conversation with a creator card. The id is
     * derived here rather than in the browser so both participants always agree
     * on which row is which.
     */
    @Transactional
    public ChatThread openThreadWithCreator(Long userId, String creatorId) {
        Creator creator = creatorRepository.findById(creatorId)
                .orElseThrow(() -> new RuntimeException("Creator not found: " + creatorId));

        Long partnerUserId = creator.getUserId();
        if (partnerUserId != null && partnerUserId.equals(userId)) {
            throw new RuntimeException("You cannot start a conversation with yourself");
        }

        String threadId = threadIdFor(userId, partnerUserId, creatorId);

        return chatThreadRepository.findById(threadId).orElseGet(() ->
                chatThreadRepository.save(ChatThread.builder()
                        .id(threadId)
                        .userId(userId)
                        .partnerUserId(partnerUserId)
                        .partnerCreatorId(creatorId)
                        .name(creator.getName())
                        .avatar(creator.getAvatar())
                        .bgClass(creator.getBgClass())
                        .status((creator.getNiche() != null ? creator.getNiche() : "Creator")
                                + " · " + (creator.getLocation() != null ? creator.getLocation() : "Worldwide"))
                        .snippet("")
                        .time("Just now")
                        .unread(false)
                        .build()));
    }

    /**
     * Opens (or reuses) a conversation with another account directly, for people
     * who have no discover card — a post author or commenter, say.
     */
    @Transactional
    public ChatThread openThreadWithUser(Long userId, Long otherUserId) {
        if (userId.equals(otherUserId)) {
            throw new RuntimeException("You cannot start a conversation with yourself");
        }

        User other = userRepository.findById(otherUserId)
                .orElseThrow(() -> new RuntimeException("User not found: " + otherUserId));

        String threadId = threadIdFor(userId, otherUserId, null);

        return chatThreadRepository.findById(threadId).orElseGet(() -> {
            String name = displayNameOf(other);
            return chatThreadRepository.save(ChatThread.builder()
                    .id(threadId)
                    .userId(userId)
                    .partnerUserId(otherUserId)
                    .name(name)
                    .avatar(other.getAvatar() != null ? other.getAvatar()
                            : name.substring(0, Math.min(2, name.length())).toUpperCase())
                    .bgClass(other.getBgClass() != null ? other.getBgClass() : "avatar-purple")
                    .status(other.getNiche() != null ? other.getNiche() : "Conexus Creator")
                    .snippet("")
                    .time("Just now")
                    .unread(false)
                    .build());
        });
    }

    /**
     * Writes a note into both sides of a conversation — used when something
     * happens between two people that belongs in their thread, like a
     * connection request. Creates the threads if they do not exist yet.
     */
    @Transactional
    public void postSystemMessage(Long fromUserId, Long toUserId, String text) {
        if (fromUserId == null || toUserId == null || fromUserId.equals(toUserId)) return;

        String now = LocalTime.now().format(CLOCK);

        ChatThread senderSide = openThreadWithUser(fromUserId, toUserId);
        appendSystem(senderSide, text, now);
        chatThreadRepository.save(senderSide);

        ChatThread recipientSide = openThreadWithUser(toUserId, fromUserId);
        appendSystem(recipientSide, text, now);
        recipientSide.setUnread(true);
        chatThreadRepository.save(recipientSide);
    }

    private void appendSystem(ChatThread thread, String text, String now) {
        thread.getMessages().add(ChatMessage.builder()
                .sender("system")
                .senderName("Conexus")
                .text(text)
                .time(now)
                .system(true)
                .thread(thread)
                .build());

        thread.setSnippet(text);
        thread.setTime(now);
    }

    @Transactional
    public ChatThread markRead(String id) {
        ChatThread thread = getThread(id);
        thread.setUnread(false);
        return chatThreadRepository.save(thread);
    }

    @Transactional
    public ChatThread sendMessage(String threadId, String text, Long senderId, String sender) {
        ChatThread thread = getThread(threadId);
        String now = LocalTime.now().format(CLOCK);
        boolean fromOwner = !"them".equals(sender);

        // The display name comes from the account, not from the request body.
        User senderUser = senderId != null ? userRepository.findById(senderId).orElse(null) : null;
        String senderName = fromOwner ? displayNameOf(senderUser) : thread.getName();

        appendMessage(thread, fromOwner ? "me" : "them", text, senderName, fromOwner ? senderId : null, now);
        thread.setUnread(false);
        ChatThread saved = chatThreadRepository.save(thread);

        // Deliver to the other participant. Without this the message only ever
        // existed in the sender's own inbox and the recipient saw nothing.
        if (fromOwner && thread.getPartnerUserId() != null) {
            deliverToPartner(thread, text, now);
        }

        return saved;
    }

    private void deliverToPartner(ChatThread sourceThread, String text, String now) {
        Long recipientId = sourceThread.getPartnerUserId();
        Long authorId = sourceThread.getUserId();

        String partnerThreadId = threadIdFor(recipientId, authorId, sourceThread.getPartnerCreatorId());

        ChatThread partnerThread = chatThreadRepository.findById(partnerThreadId)
                .orElseGet(() -> chatThreadRepository.save(describeSenderFor(partnerThreadId, recipientId, authorId)));

        // The author's message is "them" from the recipient's point of view.
        User author = authorId != null ? userRepository.findById(authorId).orElse(null) : null;
        String authorName = author != null ? displayNameOf(author) : sourceThread.getName();

        appendMessage(partnerThread, "them", text, authorName, authorId, now);
        partnerThread.setUnread(true);
        chatThreadRepository.save(partnerThread);

        notificationService.notify(recipientId, authorId, NotificationService.MESSAGE,
                Notification.builder()
                        .threadId(partnerThread.getId())
                        .excerpt(NotificationService.excerpt(text)));
    }

    /** Builds the recipient's side of a conversation, described from their view. */
    private ChatThread describeSenderFor(String threadId, Long recipientId, Long authorId) {
        User author = authorId != null ? userRepository.findById(authorId).orElse(null) : null;

        String name = displayNameOf(author);
        String avatar = author != null && author.getAvatar() != null
                ? author.getAvatar()
                : name.substring(0, Math.min(2, name.length())).toUpperCase();

        return ChatThread.builder()
                .id(threadId)
                .userId(recipientId)
                .partnerUserId(authorId)
                .name(name)
                .avatar(avatar)
                .bgClass(author != null && author.getBgClass() != null ? author.getBgClass() : "avatar-purple")
                .status(author != null && author.getNiche() != null ? author.getNiche() : "Conexus Creator")
                .snippet("")
                .time(LocalTime.now().format(CLOCK))
                .unread(true)
                .build();
    }

    private void appendMessage(ChatThread thread, String sender, String text, String senderName, Long senderId, String now) {
        thread.getMessages().add(ChatMessage.builder()
                .sender(sender)
                .senderName(senderName != null ? senderName : "You")
                .senderId(senderId)
                .text(text)
                .time(now)
                .thread(thread)
                .build());

        thread.setSnippet(text);
        thread.setTime(now);
    }
}
