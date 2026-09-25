package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.persistence.*;
import java.util.ArrayList;
import java.util.List;

/**
 * A messaging thread between the current user and another creator or brand.
 */
@Entity
@Table(name = "chat_threads")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatThread {

    @Id
    @Column(nullable = false, unique = true)
    private String id;

    /** Owner user ID — whose inbox this copy of the conversation belongs to */
    private Long userId;

    /**
     * The account on the other end. Each participant owns their own thread row
     * (so unread state is per-user); messages are mirrored between the pair.
     * Null means there is no account to deliver to.
     */
    private Long partnerUserId;

    /** The creator card this conversation was started from, for reference. */
    private String partnerCreatorId;

    private String name;
    private String avatar;
    private String bgClass;
    private String status;
    private String snippet;
    private String time;

    @Builder.Default
    private boolean unread = false;

    /** When the last message landed — orders the inbox and ages the timestamp. */
    private java.time.Instant updatedAt;

    @OneToMany(mappedBy = "thread", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("id ASC")
    @Builder.Default
    private List<ChatMessage> messages = new ArrayList<>();
}
