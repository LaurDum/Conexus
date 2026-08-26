import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ViewTab = 'view-home' | 'view-discover' | 'view-recommendations' | 'view-messages' | 'view-profile';

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  private activeTabSubject = new BehaviorSubject<ViewTab>('view-home');
  activeTab$: Observable<ViewTab> = this.activeTabSubject.asObservable();

  setActiveTab(tab: ViewTab) {
    this.activeTabSubject.next(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
