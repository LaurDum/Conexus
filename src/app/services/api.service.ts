import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Creator, Post, SocialAccount, ProfileInfo } from '../models/creator.model';
import { ChatThread } from '../models/chat.model';

/**
 * Wraps all REST calls to the Spring Boot backend (http://localhost:8080/api).
 * Inject this service wherever you need to read or write persisted data.
 */
@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private readonly base = 'http://localhost:8080/api';

  constructor(private http: HttpClient) {}

  // ──────────────────────────────────────────────
  // Creators
  // ──────────────────────────────────────────────

  getCreators(params?: { category?: string; search?: string }): Observable<Creator[]> {
    return this.http.get<Creator[]>(`${this.base}/creators`, { params: params as any });
  }

  getCreator(id: string): Observable<Creator> {
    return this.http.get<Creator>(`${this.base}/creators/${id}`);
  }

  createCreator(creator: Partial<Creator>): Observable<Creator> {
    return this.http.post<Creator>(`${this.base}/creators`, creator);
  }

  // ──────────────────────────────────────────────
  // Posts (Inspo Feed)
  // ──────────────────────────────────────────────

  getPosts(): Observable<Post[]> {
    return this.http.get<Post[]>(`${this.base}/posts`);
  }

  createPost(post: { authorName: string; niche: string; content: string; avatarClass: string }): Observable<Post> {
    return this.http.post<Post>(`${this.base}/posts`, post);
  }

  toggleLike(postId: number | string): Observable<Post> {
    return this.http.put<Post>(`${this.base}/posts/${postId}/like`, {});
  }

  deletePost(postId: number | string): Observable<void> {
    return this.http.delete<void>(`${this.base}/posts/${postId}`);
  }

  // ──────────────────────────────────────────────
  // Social Accounts
  // ──────────────────────────────────────────────

  getSocials(): Observable<SocialAccount[]> {
    return this.http.get<SocialAccount[]>(`${this.base}/socials`);
  }

  addSocial(account: Partial<SocialAccount>): Observable<SocialAccount> {
    return this.http.post<SocialAccount>(`${this.base}/socials`, account);
  }

  deleteSocial(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/socials/${id}`);
  }

  // ──────────────────────────────────────────────
  // Profile
  // ──────────────────────────────────────────────

  getProfile(): Observable<ProfileInfo> {
    return this.http.get<ProfileInfo>(`${this.base}/profile`);
  }

  updateProfile(profile: Partial<ProfileInfo>): Observable<ProfileInfo> {
    return this.http.put<ProfileInfo>(`${this.base}/profile`, profile);
  }

  // ──────────────────────────────────────────────
  // Chat
  // ──────────────────────────────────────────────

  getChatThreads(): Observable<ChatThread[]> {
    return this.http.get<ChatThread[]>(`${this.base}/chats`);
  }

  getChatThread(id: string): Observable<ChatThread> {
    return this.http.get<ChatThread>(`${this.base}/chats/${id}`);
  }

  markThreadRead(id: string): Observable<ChatThread> {
    return this.http.put<ChatThread>(`${this.base}/chats/${id}/read`, {});
  }

  sendMessage(threadId: string, text: string, senderName?: string, senderId?: number): Observable<ChatThread> {
    return this.http.post<ChatThread>(`${this.base}/chats/${threadId}/messages`, { text, senderName, senderId });
  }
}
