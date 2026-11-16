import type * as DTO from '../types/api';
import {
  health as healthRequest,
  login as loginRequest,
  logout as logoutRequest,
  request,
} from './client';

type QueryValue = string | number | boolean | null | undefined;

function withQuery(path: string, params: object): string {
  const query = new URLSearchParams();
  const entries = Object.entries(params) as Array<[string, QueryValue]>;
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export function login(phone: string, code: string): Promise<DTO.AuthSession> {
  return loginRequest(phone, code);
}

export function logout(): Promise<void> {
  return logoutRequest();
}

export function health(): Promise<DTO.Health> {
  return healthRequest();
}

export function sendSmsCode(phone: string): Promise<DTO.SmsSendData> {
  return request<DTO.SmsSendData>('/api/v1/auth/sms/send', {
    method: 'POST',
    body: { phone },
    auth: false,
  });
}

export function mobileLyrics(input: DTO.MobileLyricsInput): Promise<DTO.MobileLyrics> {
  return request<DTO.MobileLyrics>('/api/v1/mobile/lyrics', { method: 'POST', body: input });
}

export function mobileMusic(input: DTO.MobileMusicInput): Promise<DTO.MobileMusicResult> {
  return request<DTO.MobileMusicResult>('/api/v1/mobile/music', { method: 'POST', body: input });
}

export function getMe(): Promise<DTO.Me> {
  return request<DTO.Me>('/api/v1/me');
}

export function updateMe(input: DTO.UpdateMeRequest): Promise<DTO.User> {
  return request<DTO.User>('/api/v1/me', { method: 'PUT', body: input });
}

export function saveMyInterests(input: DTO.SaveInterestsRequest): Promise<DTO.SaveInterestsResult> {
  return request<DTO.SaveInterestsResult>('/api/v1/me/interests', { method: 'POST', body: input });
}

export function getRecommendFeed(params: DTO.PaginationQuery = {}): Promise<DTO.RecommendFeed> {
  return request<DTO.RecommendFeed>(withQuery('/api/v1/feed/recommend', params));
}

export function getFollowingFeed(params: DTO.PaginationQuery = {}): Promise<DTO.FollowingFeed> {
  return request<DTO.FollowingFeed>(withQuery('/api/v1/feed/following', params));
}

export function submitFeedFeedback(input: DTO.FeedFeedbackRequest): Promise<DTO.OkResult> {
  return request<DTO.OkResult>('/api/v1/feed/feedback', { method: 'POST', body: input });
}

export function getPlaza(params: DTO.PlazaQuery = {}): Promise<DTO.Page<DTO.Work>> {
  return request<DTO.Page<DTO.Work>>(withQuery('/api/v1/plaza', params));
}

export function search(query: string): Promise<DTO.SearchResult> {
  return request<DTO.SearchResult>(withQuery('/api/v1/search', { q: query }));
}

export function listWorks(params: DTO.WorksQuery = {}): Promise<DTO.Page<DTO.Work>> {
  return request<DTO.Page<DTO.Work>>(withQuery('/api/v1/works', params));
}

export function getMyWorks(params: DTO.MyWorksQuery = {}): Promise<DTO.Page<DTO.Work>> {
  return request<DTO.Page<DTO.Work>>(withQuery('/api/v1/me/works', params));
}

export function getWork(id: string): Promise<DTO.Work> {
  return request<DTO.Work>(`/api/v1/works/${encodeURIComponent(id)}`);
}

export function getWorkLyrics(id: string): Promise<DTO.WorkLyrics> {
  return request<DTO.WorkLyrics>(`/api/v1/works/${encodeURIComponent(id)}/lyrics`);
}

export function deleteWork(id: string): Promise<DTO.DeleteResult> {
  return request<DTO.DeleteResult>(`/api/v1/works/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function publishWork(id: string, input: DTO.PublishWorkRequest): Promise<DTO.Work> {
  return request<DTO.Work>(`/api/v1/works/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    body: input,
  });
}

export function setWorkVisibility(id: string, input: DTO.SetVisibilityRequest): Promise<DTO.SetVisibilityResult> {
  return request<DTO.SetVisibilityResult>(`/api/v1/works/${encodeURIComponent(id)}/visibility`, {
    method: 'PUT',
    body: input,
  });
}

export function recordWorkPlay(id: string): Promise<DTO.OkResult> {
  return request<DTO.OkResult>(`/api/v1/works/${encodeURIComponent(id)}/play`, { method: 'POST' });
}

export function likeWork(id: string): Promise<DTO.LikeResult> {
  return request<DTO.LikeResult>(`/api/v1/works/${encodeURIComponent(id)}/like`, { method: 'POST' });
}

export function unlikeWork(id: string): Promise<DTO.LikeResult> {
  return request<DTO.LikeResult>(`/api/v1/works/${encodeURIComponent(id)}/like`, { method: 'DELETE' });
}

export function collectWork(id: string): Promise<DTO.CollectResult> {
  return request<DTO.CollectResult>(`/api/v1/works/${encodeURIComponent(id)}/collect`, { method: 'POST' });
}

export function uncollectWork(id: string): Promise<DTO.CollectResult> {
  return request<DTO.CollectResult>(`/api/v1/works/${encodeURIComponent(id)}/collect`, { method: 'DELETE' });
}

export function getWorkComments(id: string, params: DTO.LimitQuery = {}): Promise<DTO.Items<DTO.Comment>> {
  return request<DTO.Items<DTO.Comment>>(withQuery(`/api/v1/works/${encodeURIComponent(id)}/comments`, params));
}

export function addWorkComment(id: string, input: DTO.AddCommentRequest): Promise<DTO.Comment> {
  return request<DTO.Comment>(`/api/v1/works/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    body: input,
  });
}

export function deleteComment(id: string): Promise<DTO.DeleteResult> {
  return request<DTO.DeleteResult>(`/api/v1/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getUserProfile(id: string): Promise<DTO.UserProfile> {
  return request<DTO.UserProfile>(`/api/v1/users/${encodeURIComponent(id)}`);
}

export function getMusicianProfile(id: string): Promise<DTO.MusicianProfile> {
  return request<DTO.MusicianProfile>(`/api/v1/musicians/${encodeURIComponent(id)}`);
}

export function followUser(id: string): Promise<DTO.FollowResult> {
  return request<DTO.FollowResult>(`/api/v1/users/${encodeURIComponent(id)}/follow`, { method: 'POST' });
}

export function unfollowUser(id: string): Promise<DTO.FollowResult> {
  return request<DTO.FollowResult>(`/api/v1/users/${encodeURIComponent(id)}/follow`, { method: 'DELETE' });
}

export function getMyFollowing(): Promise<DTO.Items<DTO.UserCard>> {
  return request<DTO.Items<DTO.UserCard>>('/api/v1/me/following');
}

export function getMyFollowers(): Promise<DTO.Items<DTO.UserCard>> {
  return request<DTO.Items<DTO.UserCard>>('/api/v1/me/followers');
}

export function getMyFriends(): Promise<DTO.Items<DTO.UserCard>> {
  return request<DTO.Items<DTO.UserCard>>('/api/v1/me/friends');
}

export function getUserFollowing(id: string): Promise<DTO.Items<DTO.UserCard>> {
  return request<DTO.Items<DTO.UserCard>>(`/api/v1/users/${encodeURIComponent(id)}/following`);
}

export function getUserFollowers(id: string): Promise<DTO.Items<DTO.UserCard>> {
  return request<DTO.Items<DTO.UserCard>>(`/api/v1/users/${encodeURIComponent(id)}/followers`);
}

export function blockUser(id: string): Promise<DTO.BlockResult> {
  return request<DTO.BlockResult>(`/api/v1/users/${encodeURIComponent(id)}/block`, { method: 'POST' });
}

export function unblockUser(id: string): Promise<DTO.BlockResult> {
  return request<DTO.BlockResult>(`/api/v1/users/${encodeURIComponent(id)}/block`, { method: 'DELETE' });
}

export function applyForMusician(input: DTO.MusicianApplicationRequest): Promise<DTO.MusicianApplicationResult> {
  return request<DTO.MusicianApplicationResult>('/api/v1/musicians/applications', {
    method: 'POST',
    body: input,
  });
}

export function getMyMusicianApplication(): Promise<DTO.Musician> {
  return request<DTO.Musician>('/api/v1/musicians/applications/me');
}

export function createQuote(input: DTO.QuoteRequest): Promise<DTO.Quote> {
  return request<DTO.Quote>('/api/v1/credit/quotes', { method: 'POST', body: input });
}

export function createGeneration(input: DTO.CreateGenerationRequest): Promise<DTO.Generation> {
  return request<DTO.Generation>('/api/v1/generations', { method: 'POST', body: input });
}

export function getGeneration(id: string): Promise<DTO.Generation> {
  return request<DTO.Generation>(`/api/v1/generations/${encodeURIComponent(id)}`);
}

export function cancelGeneration(id: string): Promise<DTO.Generation> {
  return request<DTO.Generation>(`/api/v1/generations/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

export function getNotifications(params: DTO.NotificationsQuery = {}): Promise<DTO.Notifications> {
  return request<DTO.Notifications>(withQuery('/api/v1/notifications', params));
}

export function markNotificationsRead(input: DTO.ReadNotificationsRequest = {}): Promise<DTO.OkResult> {
  return request<DTO.OkResult>('/api/v1/notifications/read', { method: 'POST', body: input });
}

export function markNotificationRead(id: string): Promise<DTO.OkResult> {
  return request<DTO.OkResult>(`/api/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export function getConversations(): Promise<DTO.Items<DTO.Conversation>> {
  return request<DTO.Items<DTO.Conversation>>('/api/v1/conversations');
}

export function createConversation(input: DTO.CreateConversationRequest): Promise<DTO.CreateConversationResult> {
  return request<DTO.CreateConversationResult>('/api/v1/conversations', { method: 'POST', body: input });
}

export function getConversationMessages(id: string, params: DTO.LimitQuery = {}): Promise<DTO.Items<DTO.Message>> {
  return request<DTO.Items<DTO.Message>>(withQuery(`/api/v1/conversations/${encodeURIComponent(id)}/messages`, params));
}

export function sendConversationMessage(id: string, input: DTO.SendMessageRequest): Promise<DTO.Message> {
  return request<DTO.Message>(`/api/v1/conversations/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: input,
  });
}

export function markConversationRead(id: string): Promise<DTO.OkResult> {
  return request<DTO.OkResult>(`/api/v1/conversations/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export function getCreditPackages(): Promise<DTO.Items<DTO.CreditPackage>> {
  return request<DTO.Items<DTO.CreditPackage>>('/api/v1/credit/packages');
}

export function rechargeCredits(input: DTO.RechargeRequest): Promise<DTO.CreditAccount> {
  return request<DTO.CreditAccount>('/api/v1/credit/recharge', { method: 'POST', body: input });
}

export function getMyCredits(): Promise<DTO.CreditAccount> {
  return request<DTO.CreditAccount>('/api/v1/me/credits');
}

export function getCreditLedger(params: DTO.LimitQuery = {}): Promise<DTO.Items<DTO.LedgerEntry>> {
  return request<DTO.Items<DTO.LedgerEntry>>(withQuery('/api/v1/me/credits/ledger', params));
}

export function createShareLink(input: DTO.CreateShareLinkRequest): Promise<DTO.ShareLink> {
  return request<DTO.ShareLink>('/api/v1/share-links', { method: 'POST', body: input });
}

export function getShareLanding(code: string): Promise<DTO.ShareLanding> {
  return request<DTO.ShareLanding>(`/api/v1/s/${encodeURIComponent(code)}`);
}

export function trackShareEvent(input: DTO.ShareEventRequest): Promise<DTO.OkResult> {
  return request<DTO.OkResult>('/api/v1/share-events', { method: 'POST', body: input });
}
