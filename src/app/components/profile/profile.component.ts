import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../services/state.service';
import { AuthService } from '../../services/auth.service';
import { SocialAccount, ProfileInfo, Post } from '../../models/creator.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html'
})
export class ProfileComponent implements OnInit {
  socials: SocialAccount[] = [];
  profile!: ProfileInfo;
  userPosts: Post[] = [];
  isDarkMode: boolean = true;

  // Edit Profile modal inputs
  editName: string = '';
  editHandle: string = '';
  editLocation: string = '';
  editBio: string = '';

  // Add Social modal inputs
  socialPlatform: string = 'youtube';
  socialHandle: string = '';
  socialUrl: string = '';
  socialFollowers: string = '';

  constructor(
    public stateService: StateService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.stateService.socials$.subscribe(list => this.socials = list);
    this.stateService.isDarkMode$.subscribe(dark => this.isDarkMode = dark);

    // Dynamic user session binding
    this.authService.currentUser$.subscribe(currentUser => {
      if (currentUser) {
        this.profile = {
          displayName: currentUser.displayName,
          handle: '@' + currentUser.username,
          bio: currentUser.niche ? `${currentUser.niche} | Building on Conexus 🚀` : 'Digital Creator on Conexus.',
          location: 'Worldwide',
          totalReach: '1K',
          engagement: '5.0%'
        };
        this.userPosts = this.userPosts.filter(p => p.authorName === currentUser.displayName || p.authorName === currentUser.username);
      } else {
        this.stateService.profile$.subscribe(info => {
          this.profile = info;
        });
      }
      if (this.profile) {
        this.editName = this.profile.displayName;
        this.editHandle = this.profile.handle;
        this.editLocation = this.profile.location;
        this.editBio = this.profile.bio;
      }
    });

    this.stateService.posts$.subscribe(posts => {
      const currentUser = this.authService.currentUser;
      if (currentUser) {
        this.userPosts = posts.filter(p => p.authorName === currentUser.displayName || p.authorName === currentUser.username);
      } else {
        this.userPosts = posts.filter(p => p.authorName === 'Laur');
      }
    });
  }

  toggleTheme(): void {
    this.stateService.toggleTheme();
  }

  openAddSocialModal(): void {
    this.socialPlatform = 'youtube';
    this.socialHandle = '';
    this.socialUrl = '';
    this.socialFollowers = '';
    this.stateService.addSocialModalOpenSubject.next(true);
  }

  deleteSocial(id: string): void {
    this.stateService.deleteSocialAccount(id);
  }

  openEditProfileModal(): void {
    this.stateService.editProfileModalOpenSubject.next(true);
  }
}
