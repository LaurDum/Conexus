export interface SocialAccount {
  id: string;
  platform: string;
  name: string;
  handle: string;
  url: string;
  followers: string;
  icon: string;
  class: string;
}

export interface Creator {
  id: string;
  name: string;
  niche: string;
  category: string;
  location: string;
  followers: string;
  match: number;
  avatar: string;
  bgClass: string;
}

export interface Post {
  id: string;
  authorName: string;
  niche: string;
  timeAgo: string;
  content: string;
  likesCount: number;
  isLiked: boolean;
  commentsCount: number;
  avatarClass: string;
}

export interface ProfileInfo {
  displayName: string;
  handle: string;
  bio: string;
  location: string;
  totalReach: string;
  engagement: string;
}
