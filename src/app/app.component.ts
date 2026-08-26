import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from './services/state.service';
import { NavigationService, ViewTab } from './services/navigation.service';
import { HomeComponent } from './components/home/home.component';
import { DiscoverComponent } from './components/discover/discover.component';
import { StrategyComponent } from './components/strategy/strategy.component';
import { MessagesComponent } from './components/messages/messages.component';
import { ProfileComponent } from './components/profile/profile.component';
import { CreatePostModalComponent } from './components/create-post-modal/create-post-modal.component';
import { OutreachModalComponent } from './components/outreach-modal/outreach-modal.component';
import { AuthModalComponent } from './components/auth-modal/auth-modal.component';
import { AuthService } from './services/auth.service';
import { ChatThread } from './models/chat.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HomeComponent,
    DiscoverComponent,
    StrategyComponent,
    MessagesComponent,
    ProfileComponent,
    CreatePostModalComponent,
    OutreachModalComponent,
    AuthModalComponent
  ],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  activeTab: ViewTab = 'view-home';
  activeThread: ChatThread | null = null;
  chatMessageText: string = '';
  showAuthModal = false;

  // Add Social Form fields
  socialPlatform: string = 'youtube';
  socialHandle: string = '';
  socialUrl: string = '';
  socialFollowers: string = '';

  // Edit Profile Form fields
  editDisplayName: string = '';
  editHandle: string = '';
  editLocation: string = '';
  editBio: string = '';

  constructor(
    public stateService: StateService,
    public navService: NavigationService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.navService.activeTab$.subscribe(tab => this.activeTab = tab);

    this.stateService.activeThreadId$.subscribe(id => {
      if (id) {
        this.stateService.chats$.subscribe(map => {
          this.activeThread = map[id] || null;
        });
      } else {
        this.activeThread = null;
      }
    });

    this.stateService.profile$.subscribe(p => {
      this.editDisplayName = p.displayName;
      this.editHandle = p.handle;
      this.editLocation = p.location;
      this.editBio = p.bio;
    });
  }

  setTab(tab: ViewTab): void {
    this.navService.setActiveTab(tab);
  }

  toggleNotifications(): void {
    const current = this.stateService.notificationsOpenSubject.value;
    this.stateService.notificationsOpenSubject.next(!current);
  }

  closeNotifications(): void {
    this.stateService.notificationsOpenSubject.next(false);
  }

  openCreateModal(): void {
    this.stateService.createModalOpenSubject.next(true);
  }

  closeChat(): void {
    this.stateService.closeChat();
  }

  sendChatMessage(): void {
    if (!this.chatMessageText.trim() || !this.activeThread) return;
    const currentUser = this.authService.currentUser;
    const senderName = currentUser ? currentUser.displayName : 'You';
    const senderId = currentUser ? currentUser.id : undefined;

    this.stateService.sendMessage(this.activeThread.id, this.chatMessageText.trim(), senderName, senderId);
    this.chatMessageText = '';
  }

  closeAddSocialModal(): void {
    this.stateService.addSocialModalOpenSubject.next(false);
  }

  submitAddSocial(): void {
    if (!this.socialHandle || !this.socialUrl || !this.socialFollowers) return;
    this.stateService.addSocialAccount(
      this.socialPlatform,
      this.socialHandle.trim(),
      this.socialUrl.trim(),
      this.socialFollowers.trim()
    );
    this.closeAddSocialModal();
  }

  closeEditProfileModal(): void {
    this.stateService.editProfileModalOpenSubject.next(false);
  }

  submitEditProfile(): void {
    this.stateService.updateProfile({
      displayName: this.editDisplayName.trim(),
      handle: this.editHandle.trim(),
      location: this.editLocation.trim(),
      bio: this.editBio.trim()
    });
    this.closeEditProfileModal();
  }
}
