import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SocialAccount, Creator, Post, ProfileInfo } from '../models/creator.model';
import { ChatThread, ChatMessage } from '../models/chat.model';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class StateService {

  // Theme State (Dark vs Light)
  private isDarkModeSubject = new BehaviorSubject<boolean>(true);
  isDarkMode$: Observable<boolean> = this.isDarkModeSubject.asObservable();

  // Platform Metadata map
  readonly platformMeta: { [key: string]: { name: string; icon: string; class: string } } = {
    youtube:   { name: 'YouTube', icon: '▶', class: 'platform-youtube' },
    tiktok:    { name: 'TikTok', icon: '🎵', class: 'platform-tiktok' },
    instagram: { name: 'Instagram', icon: '📷', class: 'platform-instagram' },
    twitch:    { name: 'Twitch', icon: '👾', class: 'platform-twitch' },
    twitter:   { name: 'X (Twitter)', icon: '𝕏', class: 'platform-twitter' },
    discord:   { name: 'Discord', icon: '💬', class: 'platform-discord' },
    spotify:   { name: 'Spotify', icon: '🎧', class: 'platform-spotify' },
    substack:  { name: 'Substack', icon: '📰', class: 'platform-substack' },
    linkedin:  { name: 'LinkedIn', icon: '💼', class: 'platform-linkedin' },
    website:   { name: 'Website', icon: '🌐', class: 'platform-website' }
  };

  // State Subjects initialized with empty arrays, populated from Backend API
  private socialsSubject = new BehaviorSubject<SocialAccount[]>([]);
  socials$: Observable<SocialAccount[]> = this.socialsSubject.asObservable();

  private profileSubject = new BehaviorSubject<ProfileInfo>({
    displayName: 'User',
    handle: '@user',
    bio: 'Creator on Conexus.',
    location: 'Earth',
    totalReach: '0',
    engagement: '0%'
  });
  profile$: Observable<ProfileInfo> = this.profileSubject.asObservable();

  private creatorsSubject = new BehaviorSubject<Creator[]>([]);
  creators$: Observable<Creator[]> = this.creatorsSubject.asObservable();

  private postsSubject = new BehaviorSubject<Post[]>([]);
  posts$: Observable<Post[]> = this.postsSubject.asObservable();

  private chatsSubject = new BehaviorSubject<{ [key: string]: ChatThread }>({});
  chats$: Observable<{ [key: string]: ChatThread }> = this.chatsSubject.asObservable();

  private activeThreadIdSubject = new BehaviorSubject<string | null>(null);
  activeThreadId$: Observable<string | null> = this.activeThreadIdSubject.asObservable();

  // Modal Visibility States
  createModalOpenSubject = new BehaviorSubject<boolean>(false);
  addSocialModalOpenSubject = new BehaviorSubject<boolean>(false);
  editProfileModalOpenSubject = new BehaviorSubject<boolean>(false);
  outreachModalOpenSubject = new BehaviorSubject<boolean>(false);
  notificationsOpenSubject = new BehaviorSubject<boolean>(false);
  outreachTargetCreatorSubject = new BehaviorSubject<string>('Alex Popescu');

  constructor(private apiService: ApiService) {
    this.loadInitialData();
  }

  /**
   * Fetch all persisted data from PostgreSQL via Spring Boot REST API
   */
  public loadInitialData(): void {
    this.apiService.getCreators().subscribe({
      next: (list) => this.creatorsSubject.next(list),
      error: (err) => console.error('Failed to load creators from DB', err)
    });

    this.apiService.getPosts().subscribe({
      next: (list) => this.postsSubject.next(list),
      error: (err) => console.error('Failed to load posts from DB', err)
    });

    this.apiService.getSocials().subscribe({
      next: (list) => this.socialsSubject.next(list),
      error: (err) => console.error('Failed to load socials from DB', err)
    });

    this.apiService.getProfile().subscribe({
      next: (info) => this.profileSubject.next(info),
      error: (err) => console.error('Failed to load profile from DB', err)
    });

    this.apiService.getChatThreads().subscribe({
      next: (threads) => {
        const map: { [key: string]: ChatThread } = {};
        threads.forEach(t => map[t.id] = t);
        this.chatsSubject.next(map);
      },
      error: (err) => console.error('Failed to load chat threads from DB', err)
    });
  }

  // Toggle Theme
  toggleTheme(): void {
    const isDark = !this.isDarkModeSubject.value;
    this.isDarkModeSubject.next(isDark);
    if (isDark) {
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
    }
  }

  // ──────────────────────────────────────────────
  // Persistent Database Actions via ApiService
  // ──────────────────────────────────────────────

  addSocialAccount(platform: string, handle: string, url: string, followers: string) {
    const meta = this.platformMeta[platform] || { name: platform, icon: '🌐', class: 'platform-website' };
    const payload: Partial<SocialAccount> = {
      platform,
      name: meta.name,
      handle,
      url,
      followers,
      icon: meta.icon,
      class: meta.class
    };

    this.apiService.addSocial(payload).subscribe({
      next: (saved) => {
        this.socialsSubject.next([...this.socialsSubject.value, saved]);
      },
      error: (err) => console.error('Error saving social link to DB', err)
    });
  }

  deleteSocialAccount(id: string) {
    this.apiService.deleteSocial(id).subscribe({
      next: () => {
        const updated = this.socialsSubject.value.filter(s => s.id !== id);
        this.socialsSubject.next(updated);
      },
      error: (err) => console.error('Error deleting social account from DB', err)
    });
  }

  updateProfile(info: Partial<ProfileInfo>) {
    this.apiService.updateProfile(info).subscribe({
      next: (updated) => this.profileSubject.next(updated),
      error: (err) => console.error('Error updating profile in DB', err)
    });
  }

  addPost(content: string, niche: string) {
    const profile = this.profileSubject.value;
    const payload = {
      authorName: profile.displayName || 'Creator',
      niche: niche || 'Tech',
      content,
      avatarClass: 'avatar-purple'
    };

    this.apiService.createPost(payload).subscribe({
      next: (savedPost) => {
        this.postsSubject.next([savedPost, ...this.postsSubject.value]);
      },
      error: (err) => console.error('Error creating post in DB', err)
    });
  }

  toggleLikePost(postId: string | number) {
    this.apiService.toggleLike(postId).subscribe({
      next: (updatedPost) => {
        const updated = this.postsSubject.value.map(p => p.id === updatedPost.id ? updatedPost : p);
        this.postsSubject.next(updated);
      },
      error: (err) => console.error('Error toggling like in DB', err)
    });
  }

  openChat(threadId: string) {
    this.apiService.markThreadRead(threadId).subscribe({
      next: (updatedThread) => {
        const chats = this.chatsSubject.value;
        chats[threadId] = updatedThread;
        this.chatsSubject.next({ ...chats });
      },
      error: () => {
        // Fallback for unread toggle locally
        const chats = this.chatsSubject.value;
        if (chats[threadId]) {
          chats[threadId].unread = false;
          this.chatsSubject.next({ ...chats });
        }
      }
    });
    this.activeThreadIdSubject.next(threadId);
  }

  closeChat() {
    this.activeThreadIdSubject.next(null);
  }

  sendMessage(threadId: string, text: string, senderName?: string, senderId?: number) {
    this.apiService.sendMessage(threadId, text, senderName, senderId).subscribe({
      next: (updatedThread) => {
        const chats = this.chatsSubject.value;
        chats[threadId] = updatedThread;
        this.chatsSubject.next({ ...chats });
      },
      error: (err) => console.error('Error sending chat message to DB', err)
    });
  }
}
