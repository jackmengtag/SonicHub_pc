export type Visibility = 'public' | 'friends' | 'private';
export type GenerationDuration = 15 | 30 | 60 | 90 | 120;
export type GenerationQuality = '' | '标准' | '高清' | 'standard' | 'high';

export interface ApiSuccess<T> {
  code: 'OK';
  message: string;
  data: T;
}

export interface User {
  id: string;
  phone?: string;
  display_name: string;
  avatar: string;
  bio: string;
  role: string;
  status: string;
  genres: string[];
  created_at: string;
}

export interface Musician {
  user_id: string;
  stage_name: string;
  status: string;
  bio: string;
  genres: string[];
  applied_at: string;
  verified_at?: string;
}

export interface UserCard {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  verified: boolean;
  stage_name?: string;
  following: boolean;
  friend: boolean;
  follower: boolean;
  blocked: boolean;
}

export interface MobileLyricsInput {
  theme: string;
  genre: string;
  mood: string;
  bpm: number;
}

export interface MobileLyrics {
  lyrics: string;
  genre: string;
  mood: string;
  bpm: number;
}

export interface MobileMusicInput {
  prompt: string;
  lyrics: string;
  genre: string;
  mood: string;
  duration_seconds: number;
  vocal: string;
  title: string;
  visibility: string;
  auto_publish: boolean;
}

export interface MobileMusicResult {
  generation_id: string;
  status: string;
  credits: number;
  poll_url: string;
}

export interface Work {
  id: string;
  title: string;
  cover: string;
  description: string;
  visibility: string;
  status: string;
  reject_reason?: string;
  genre: string;
  tags: string[];
  audio_url: string;
  duration_seconds: number;
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  is_ai: boolean;
  owner_id: string;
  owner_name: string;
  owner_avatar: string;
  owner_verified: boolean;
  liked: boolean;
  collected: boolean;
  published_at?: string;
  created_at: string;
  reason?: string;
}

export interface Comment {
  id: string;
  work_id: string;
  user_id: string;
  name: string;
  avatar: string;
  content: string;
  created_at: string;
}

export interface Notification {
  id: string;
  type: string;
  actor_id?: string;
  actor_name?: string;
  actor_avatar?: string;
  title: string;
  body: string;
  target_type: string;
  target_id: string;
  read_at?: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  peer_id: string;
  peer_name: string;
  peer_avatar: string;
  last_message: string;
  unread: number;
  pinned: boolean;
  updated_at: string;
}

export interface Message {
  id: string;
  sender_id: string;
  type: string;
  text: string;
  work_id?: string;
  work?: Work;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  entry_type: string;
  amount: number;
  balance_after: number;
  ref_type: string;
  ref_id: string;
  created_at: string;
}

export interface CreditAccount {
  available: number;
  reserved: number;
}

export interface Quote {
  quote_id: string;
  base: number;
  quality_fee: number;
  stems_fee: number;
  duration_fee: number;
  total: number;
  status: string;
  expires_at: string;
}

export interface Generation {
  id: string;
  status: string;
  stage: string;
  progress: number;
  prompt: string;
  lyrics: string;
  styles: string[];
  mood: string;
  duration_seconds: number;
  vocal: string;
  quality: string;
  stems: boolean;
  title: string;
  visibility: string;
  auto_publish: boolean;
  model_version: string;
  error?: string;
  work_id?: string;
  created_at: string;
  finished_at?: string;
}

export interface CreditPackage {
  id: string;
  credits: number;
  price_cents: number;
  tag: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
  tenant_id: string;
  role_name: string;
  permissions: string[];
}

export interface Health {
  status: string;
  service: string;
}

export interface SmsSendData {
  sent: boolean;
  demo?: boolean;
  demo_code?: string;
  message?: string;
  provider?: string;
  biz_id?: string;
  interval_seconds?: number;
  valid_seconds?: number;
}

export interface UserCounts {
  works: number;
  following: number;
  followers: number;
  friends: number;
}

export interface Me {
  user: User;
  musician: Musician | null;
  credits: CreditAccount;
  counts: UserCounts;
  unread_notifications: number;
  role_name: string;
  permissions: string[];
}

export interface UserProfile {
  user: UserCard;
  musician: Musician | null;
  counts: UserCounts;
}

export interface MusicianProfile {
  user: UserCard;
  musician: Musician | null;
  works: Work[];
}

export interface Items<T> {
  items: T[];
}

export interface Page<T> extends Items<T> {
  next_cursor: string;
  has_more: boolean;
}

export interface RecommendFeed extends Page<Work> {
  policy_version: string;
}

export interface FollowingFeed extends Items<Work> {
  has_more: boolean;
}

export interface SearchResult {
  works: Work[];
  artists: UserCard[];
}

export interface Notifications extends Items<Notification> {
  unread: number;
}

export interface ShareLink {
  code: string;
  url: string;
}

export interface ShareLanding {
  work: Work;
  sharer_id: string;
  code: string;
}

export interface OkResult {
  ok: boolean;
}

export interface DeleteResult {
  deleted: boolean;
}

export interface LikeResult {
  liked: boolean;
  like_count: number;
}

export interface CollectResult {
  collected: boolean;
}

export interface FollowResult {
  following: boolean;
  friend: boolean;
}

export interface BlockResult {
  blocked: boolean;
}

export interface PaginationQuery {
  limit?: number;
  offset?: number;
}

export interface LimitQuery {
  limit?: number;
}

export interface WorksQuery extends PaginationQuery {
  owner?: string;
  status?: string;
  genre?: string;
  sort?: string;
}

export interface MyWorksQuery extends PaginationQuery {
  status?: string;
}

export interface PlazaQuery extends PaginationQuery {
  genre?: string;
  sort?: string;
}

export interface NotificationsQuery extends LimitQuery {
  filter?: string;
}

export interface UpdateMeRequest {
  display_name: string;
  bio: string;
}

export interface SaveInterestsRequest {
  genres: string[];
}

export interface SaveInterestsResult {
  genres: string[];
}

export interface MusicianApplicationRequest {
  stage_name: string;
  bio: string;
  genres: string[];
}

export interface MusicianApplicationResult {
  status: string;
}

export interface FeedFeedbackRequest {
  target_type: string;
  target_id: string;
  type: string;
}

export interface PublishWorkRequest {
  title?: string;
  description?: string;
  visibility?: Visibility;
  tags?: string[];
}

export interface SetVisibilityRequest {
  visibility: Visibility;
}

export interface SetVisibilityResult {
  visibility: string;
}

export interface AddCommentRequest {
  content: string;
}

export interface QuoteRequest {
  styles: string[];
  duration_seconds: GenerationDuration;
  quality?: GenerationQuality;
  stems?: boolean;
}

export interface CreateGenerationRequest {
  quote_id: string;
  prompt: string;
  styles: string[];
  duration_seconds: GenerationDuration;
  lyrics?: string;
  mood?: string;
  vocal?: string;
  quality?: GenerationQuality;
  stems?: boolean;
  title?: string;
  visibility?: Visibility;
  auto_publish?: boolean;
}

export interface RechargeRequest {
  package_id: string;
}

export interface ReadNotificationsRequest {
  id?: string;
}

export interface CreateConversationRequest {
  user_id: string;
}

export interface CreateConversationResult {
  id: string;
}

export interface SendMessageRequest {
  type?: string;
  text?: string;
  work_id?: string;
}

export interface CreateShareLinkRequest {
  work_id: string;
}

export interface ShareEventRequest {
  code: string;
  channel: string;
  event_type: string;
}
