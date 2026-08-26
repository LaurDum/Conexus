import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../services/state.service';
import { ChatThread } from '../../models/chat.model';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './messages.component.html'
})
export class MessagesComponent implements OnInit {
  chatsMap: { [key: string]: ChatThread } = {};

  constructor(public stateService: StateService) {}

  ngOnInit(): void {
    this.stateService.chats$.subscribe(map => this.chatsMap = map);
  }

  get threadsList(): ChatThread[] {
    return Object.values(this.chatsMap);
  }

  openThread(threadId: string): void {
    this.stateService.openChat(threadId);
  }
}
