import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateService } from '../../services/state.service';
import { NavigationService, ViewTab } from '../../services/navigation.service';
import { Creator, Post } from '../../models/creator.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html'
})
export class HomeComponent implements OnInit {
  creators: Creator[] = [];
  posts: Post[] = [];
  connectedState: { [key: string]: boolean } = {};

  constructor(
    public stateService: StateService,
    public navService: NavigationService
  ) {}

  ngOnInit(): void {
    this.stateService.creators$.subscribe(list => this.creators = list.slice(0, 4));
    this.stateService.posts$.subscribe(list => this.posts = list);
  }

  goTo(tab: ViewTab): void {
    this.navService.setActiveTab(tab);
  }

  toggleConnect(creatorId: string): void {
    this.connectedState[creatorId] = !this.connectedState[creatorId];
  }

  toggleLike(postId: string): void {
    this.stateService.toggleLikePost(postId);
  }

  openCreateModal(): void {
    this.stateService.createModalOpenSubject.next(true);
  }
}
