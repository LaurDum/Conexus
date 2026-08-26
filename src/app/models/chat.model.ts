export interface ChatMessage {
  id: number;
  sender: 'me' | 'them';
  text: string;
  time: string;
}

export interface ChatThread {
  id: string;
  name: string;
  avatar: string;
  bgClass: string;
  status: string;
  messages: ChatMessage[];
  unread?: boolean;
  snippet?: string;
  time?: string;
}
