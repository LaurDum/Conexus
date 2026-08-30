package com.conexus.service;

import com.conexus.model.Notification;
import com.conexus.model.ProfileInfo;
import com.conexus.model.User;
import com.conexus.repository.NotificationRepository;
import com.conexus.repository.ProfileInfoRepository;
import com.conexus.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final ProfileInfoRepository profileInfoRepository;

    public static final String POST_LIKE = "POST_LIKE";
    public static final String POST_COMMENT = "POST_COMMENT";
    public static final String COMMENT_REPLY = "COMMENT_REPLY";
    public static final String COMMENT_LIKE = "COMMENT_LIKE";
    public static final String CONNECTION = "CONNECTION";
    public static final String MESSAGE = "MESSAGE";
    public static final String JOB_APPLICATION = "JOB_APPLICATION";

    /**
     * Records a notification, unless there is nobody to tell or the actor is the
     * recipient — nobody wants telling that they liked their own post.
     */
    @Transactional
    public void notify(Long recipientId, Long actorId, String type, Notification.NotificationBuilder details) {
        if (recipientId == null || actorId == null || recipientId.equals(actorId)) return;

        User actor = userRepository.findById(actorId).orElse(null);
        if (actor == null) return;

        String actorName = profileInfoRepository.findByUserId(actorId)
                .map(ProfileInfo::getDisplayName)
                .filter(n -> n != null && !n.isBlank())
                .orElseGet(() -> actor.getDisplayName() != null ? actor.getDisplayName() : actor.getUsername());

        notificationRepository.save(details
                .userId(recipientId)
                .actorId(actorId)
                .actorName(actorName)
                .actorAvatar(actor.getAvatar())
                .actorBgClass(actor.getBgClass())
                .type(type)
                .read(false)
                .build());
    }

    /** Keeps an excerpt short enough to read at a glance. */
    public static String excerpt(String text) {
        if (text == null) return null;
        String trimmed = text.trim();
        return trimmed.length() <= 80 ? trimmed : trimmed.substring(0, 79) + "…";
    }

    public List<Notification> forUser(Long userId) {
        return notificationRepository.findTop50ByUserIdOrderByCreatedAtDesc(userId);
    }

    public long unreadCount(Long userId) {
        return notificationRepository.countByUserIdAndReadFalse(userId);
    }

    @Transactional
    public void markAllRead(Long userId) {
        List<Notification> unread = notificationRepository.findByUserIdAndReadFalse(userId);
        unread.forEach(n -> n.setRead(true));
        notificationRepository.saveAll(unread);
    }

    @Transactional
    public void markRead(Long userId, Long notificationId) {
        notificationRepository.findById(notificationId)
                .filter(n -> n.getUserId().equals(userId))
                .ifPresent(n -> {
                    n.setRead(true);
                    notificationRepository.save(n);
                });
    }
}
