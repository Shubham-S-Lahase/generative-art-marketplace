/** Shared domain types — flexible fields match API / legacy Mongo-style responses */

export interface UserProfile {
  firstName?: string;
  lastName?: string;
  bio?: string;
  location?: string;
  website?: string;
  twitter?: string;
  instagram?: string;
  [key: string]: unknown;
  avatar?: string;
  coverImage?: string;
}

export interface NotificationPrefs {
  likes?: boolean;
  comments?: boolean;
  follows?: boolean;
  purchases?: boolean;
}

export interface UserStats {
  artworksCreated?: number;
  totalViews?: number;
  totalLikes?: number;
  followersCount?: number;
  followingCount?: number;
}

export interface User {
  id?: string;
  _id?: string;
  username: string;
  email?: string;
  profile?: UserProfile;
  stats?: UserStats;
  isFollowing?: boolean;
  createdAt?: string;
}

export interface ArtworkMetrics {
  likes?: number;
  comments?: number;
  views?: number;
}

export interface ArtworkMarketplace {
  forSale?: boolean;
  price?: number;
  originalPrice?: number;
  sales?: number;
  licensing?: string[];
  exclusivity?: boolean;
}

export interface ArtworkFiles {
  preview?: string;
}

export interface ArtParameters {
  colors?: string[];
  shapes?: string[];
  seed?: number;
  size?: string;
  complexity?: number;
  pattern?: string;
  opacity?: number;
  sizeVariation?: { min: number; max: number };
  rotation?: { enabled: boolean; angle: number; variation: number };
  useGradient?: boolean;
  gradientType?: string;
  effects?: Record<string, unknown>;
  animation?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Artwork {
  id?: string;
  _id?: string;
  userId?: string;
  username?: string;
  title?: string;
  description?: string;
  tags?: string[];
  parameters?: ArtParameters;
  previewUrl?: string;
  imageUrl?: string;
  files?: ArtworkFiles;
  metrics?: ArtworkMetrics;
  marketplace?: ArtworkMarketplace;
  likedBy?: string[];
  isFeatured?: boolean;
  isVerified?: boolean;
  bookmarked?: boolean;
  remixOf?: string;
  remixOfTitle?: string;
  isPublic?: boolean;
  rating?: number;
  createdAt?: string;
}

export interface Comment {
  id?: string;
  _id?: string;
  userId?: string;
  username?: string;
  text?: string;
  parentId?: string | null;
  likes?: number;
  liked?: boolean;
  createdAt?: string;
  updatedAt?: string;
  replies?: Comment[];
}

export interface CommentTreeNode extends Comment {
  replies: CommentTreeNode[];
}

export interface Notification {
  id?: string;
  _id?: string;
  type?: string;
  title?: string;
  message?: string;
  read?: boolean;
  isRead?: boolean;
  timestamp?: number;
  isToast?: boolean;
}

export interface AuthModalState {
  isOpen: boolean;
  mode: 'login' | 'register';
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  username: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
}

export interface SessionParticipant {
  userId: string;
  username?: string;
}

export interface LiveSession {
  id?: string;
  _id?: string;
  name?: string;
  description?: string;
  hostName?: string;
  hostId?: string;
  participants?: SessionParticipant[];
  maxParticipants?: number;
  isActive?: boolean;
  currentParameters?: ArtParameters;
}

export interface ChartDataPoint {
  id?: string;
  _id?: string;
  title?: string;
  views?: number;
  likes?: number;
  metrics?: ArtworkMetrics;
}

export interface DashboardStats {
  artworksCreated?: number;
  totalViews?: number;
  totalLikes?: number;
  totalComments?: number;
  followersCount?: number;
  totalRevenue?: number;
}

export interface PurchaseRecord {
  id?: string;
  _id?: string;
  artworkId?: string;
  buyerId?: string;
  license?: string;
  licenseTerms?: string;
  amount?: number;
  transactionRef?: string;
  createdAt?: string;
  buyerUsername?: string;
  artwork?: {
    id?: string;
    title?: string;
    previewUrl?: string;
    imageUrl?: string;
    username?: string;
    marketplace?: ArtworkMarketplace;
  };
}

export interface ArtworkOwnership {
  owned: boolean;
  license?: string;
  terms?: string;
}

export interface ArtPreset {
  id: string;
  name: string;
  parameters: ArtParameters;
  createdAt: string;
}

export interface TrendingTag {
  tag: string;
  count: number;
}

export interface PopularSearch {
  query: string;
  count: number;
}

export interface SavedSearchFilters {
  q?: string;
  tags?: string;
  category?: string;
  feedMode?: string;
  color?: string;
  colorTolerance?: number;
}

export interface SavedSearch {
  id?: string;
  _id?: string;
  name: string;
  filters: SavedSearchFilters;
  createdAt?: string;
  updatedAt?: string;
}
