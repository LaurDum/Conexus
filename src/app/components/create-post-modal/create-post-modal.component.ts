import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../services/state.service';
import { NavigationService } from '../../services/navigation.service';

@Component({
  selector: 'app-create-post-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-post-modal.component.html'
})
export class CreatePostModalComponent {
  postText: string = '';
  postNiche: string = 'Tech Creator';

  constructor(
    public stateService: StateService,
    public navService: NavigationService
  ) {}

  close(): void {
    this.stateService.createModalOpenSubject.next(false);
  }

  submitPost(): void {
    if (!this.postText.trim()) return;
    this.stateService.addPost(this.postText.trim(), this.postNiche);
    this.postText = '';
    this.close();
    this.navService.setActiveTab('view-home');
  }
}
