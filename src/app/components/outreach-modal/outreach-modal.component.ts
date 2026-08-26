import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateService } from '../../services/state.service';
import { NavigationService } from '../../services/navigation.service';

@Component({
  selector: 'app-outreach-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './outreach-modal.component.html'
})
export class OutreachModalComponent {
  copied: boolean = false;

  constructor(
    public stateService: StateService,
    public navService: NavigationService
  ) {}

  close(): void {
    this.stateService.outreachModalOpenSubject.next(false);
  }

  get pitchText(): string {
    const name = this.stateService.outreachTargetCreatorSubject.value;
    const firstName = name.split(' ')[0];
    return `"Hey ${firstName}! Loved your recent content. Based on our audience overlap in gaming & tech, I think a joint video or dual stream would perform amazingly for both our channels. Let me know if you'd be down to chat!"`;
  }

  copyText(): void {
    navigator.clipboard.writeText(this.pitchText);
    this.copied = true;
    setTimeout(() => this.copied = false, 2000);
  }

  sendViaMessages(): void {
    this.close();
    this.navService.setActiveTab('view-messages');
    this.stateService.openChat('alex');
  }
}
