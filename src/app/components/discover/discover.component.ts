import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../services/state.service';
import { Creator } from '../../models/creator.model';

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './discover.component.html'
})
export class DiscoverComponent implements OnInit {
  allCreators: Creator[] = [];
  searchQuery: string = '';
  selectedCategory: string = 'all';
  connectedState: { [key: string]: boolean } = {};

  categories = [
    { label: 'All Niches', value: 'all' },
    { label: 'Tech', value: 'Tech' },
    { label: 'Gaming', value: 'Gaming' },
    { label: 'Travel', value: 'Travel' },
    { label: 'Music', value: 'Music' },
    { label: 'Fashion', value: 'Fashion' },
    { label: 'Food', value: 'Food' }
  ];

  trendingTags = ['#TokyoVlog', '#SetupTour', '#AIWorkflows', '#PodcastCollab'];

  constructor(public stateService: StateService) {}

  ngOnInit(): void {
    this.stateService.creators$.subscribe(list => this.allCreators = list);
  }

  get filteredCreators(): Creator[] {
    const q = this.searchQuery.toLowerCase().trim();
    return this.allCreators.filter(c => {
      const matchCat = this.selectedCategory === 'all' || c.category.toLowerCase() === this.selectedCategory.toLowerCase();
      const matchQ = !q || c.name.toLowerCase().includes(q) || c.niche.toLowerCase().includes(q) || c.location.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }

  selectCategory(cat: string): void {
    this.selectedCategory = cat;
  }

  setTag(tag: string): void {
    this.searchQuery = tag;
  }

  clearSearch(): void {
    this.searchQuery = '';
  }

  toggleConnect(creatorId: string): void {
    this.connectedState[creatorId] = !this.connectedState[creatorId];
  }
}
