package com.conexus.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.persistence.*;

/**
 * A single message within a ChatThread.
 */
@Entity
@Table(name = "chat_messages")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** "me" or "them" or explicit sender name */
    @Column(nullable = false)
    private String sender;

    private String senderName;
    private Long senderId;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String text;

    private String time;

    /**
     * A message the app wrote rather than a person — a connection request or
     * acceptance. Rendered as a centred note instead of a chat bubble.
     */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean default false")
    private boolean system = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "thread_id", nullable = false)
    @JsonIgnore
    private ChatThread thread;
}
