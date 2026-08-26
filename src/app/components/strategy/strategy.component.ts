import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StateService } from '../../services/state.service';
import { NavigationService } from '../../services/navigation.service';

@Component({
  selector: 'app-strategy',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './strategy.component.html'
})
export class StrategyComponent {
  stepsCompleted: { [key: number]: boolean } = {};

  constructor(
    public stateService: StateService,
    public navService: NavigationService
  ) {}

  toggleStep(stepId: number): void {
    this.stepsCompleted[stepId] = !this.stepsCompleted[stepId];
  }

  openOutreach(creatorName: string): void {
    this.stateService.outreachTargetCreatorSubject.next(creatorName);
    this.stateService.outreachModalOpenSubject.next(true);
  }

  goToProfile(): void {
    this.navService.setActiveTab('view-profile');
  }
}
