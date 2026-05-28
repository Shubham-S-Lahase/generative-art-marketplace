import axios from 'axios';
import { buildGetCacheKey, clearDedupCache, dedupedRequest } from './requestDedup';
import { normalizeArtworkList, type ArtworkListResult } from '../utils/artworks';

const client = axios.create({
  baseURL: '/api/v1',
  withCredentials: true
});

// attach auth header when we have token from cookie? cookie auto sent. Support WS token usage.
export const getAuthHeader = async () => {
  try {
    const res = await client.get('/auth/ping');
    return res.data?.token || '';
  } catch {
    return '';
  }
};

const api = {
  // Auth
  async register(data) {
    const res = await client.post('/auth/register', data);
    return res.data;
  },
  async login(data) {
    const res = await client.post('/auth/login', data);
    return res.data;
  },
  async logout() {
    const res = await client.post('/auth/logout');
    clearDedupCache();
    return res.data;
  },
  async forgotPassword(email) {
    const res = await client.post('/auth/forgot-password', { email });
    return res.data;
  },
  async resetPassword(token, password) {
    const res = await client.post('/auth/reset-password', { token, password });
    return res.data;
  },
  async getMe() {
    return dedupedRequest('users/me', async () => {
      const res = await client.get('/users/me');
      return res.data;
    });
  },

  // Artworks
  async getArtworks(params = {}): Promise<ArtworkListResult> {
    const key = buildGetCacheKey('artworks', params);
    return dedupedRequest(key, async () => {
      const res = await client.get('/artworks', { params });
      return normalizeArtworkList(res.data);
    });
  },
  async getTrendingArtworks(limit = 20) {
    const res = await client.get('/artworks/trending', { params: { limit } });
    return res.data;
  },
  async getFeaturedArtworks(limit = 20) {
    const res = await client.get('/artworks/featured', { params: { limit } });
    return res.data;
  },
  async searchArtworksByColor(params: {
    color: string;
    tolerance?: number;
    page?: number;
    limit?: number;
  }): Promise<ArtworkListResult> {
    const key = buildGetCacheKey('artworks/search/by-color', params);
    return dedupedRequest(key, async () => {
      const res = await client.get('/artworks/search/by-color', { params });
      return normalizeArtworkList(res.data);
    });
  },
  async getArtwork(id) {
    return dedupedRequest(`artworks/${id}`, async () => {
      const res = await client.get(`/artworks/${id}`);
      return res.data;
    });
  },
  async getSimilarArtworks(id: string, limit = 8) {
    const res = await client.get(`/artworks/${id}/similar`, { params: { limit } });
    return res.data;
  },
  async recordArtworkView(id) {
    const res = await client.post(`/artworks/${id}/view`);
    return res.data;
  },
  async createArtwork(payload) {
    const res = await client.post('/artworks', payload);
    return res.data;
  },
  async updateArtwork(id, payload) {
    const res = await client.put(`/artworks/${id}`, payload);
    return res.data;
  },
  async likeArtwork(id) {
    const res = await client.post(`/artworks/${id}/like`);
    return res.data;
  },
  async unlikeArtwork(id) {
    const res = await client.delete(`/artworks/${id}/like`);
    return res.data;
  },
  async bookmarkArtwork(id) {
    const res = await client.post(`/artworks/${id}/bookmark`);
    return res.data;
  },
  async unbookmarkArtwork(id) {
    const res = await client.delete(`/artworks/${id}/bookmark`);
    return res.data;
  },
  async addComment(id, text, parentId = null) {
    const body: { text: string; parentId?: string } = { text };
    if (parentId) body.parentId = parentId;
    const res = await client.post(`/artworks/${id}/comments`, body);
    return res.data;
  },
  async getComments(id) {
    return dedupedRequest(`artworks/${id}/comments`, async () => {
      const res = await client.get(`/artworks/${id}/comments`);
      return res.data;
    });
  },
  async updateComment(artworkId, commentId, text) {
    const res = await client.put(`/artworks/${artworkId}/comments/${commentId}`, { text });
    return res.data;
  },
  async deleteComment(artworkId, commentId) {
    const res = await client.delete(`/artworks/${artworkId}/comments/${commentId}`);
    return res.data;
  },
  async likeComment(artworkId, commentId) {
    const res = await client.post(`/artworks/${artworkId}/comments/${commentId}/like`);
    return res.data;
  },
  async unlikeComment(artworkId, commentId) {
    const res = await client.delete(`/artworks/${artworkId}/comments/${commentId}/like`);
    return res.data;
  },
  async getCheckoutQuote(id, license) {
    const res = await client.get(`/artworks/${id}/checkout-quote`, {
      params: { license },
    });
    return res.data;
  },
  async purchaseArtwork(id, license, idempotencyKey = null) {
    const body: { license: string; idempotencyKey?: string } = { license };
    if (idempotencyKey) body.idempotencyKey = idempotencyKey;
    const res = await client.post(`/artworks/${id}/purchase`, body);
    return res.data;
  },
  async getMyPurchases() {
    const res = await client.get('/me/purchases');
    return res.data;
  },
  async getMySales() {
    const res = await client.get('/me/sales');
    return res.data;
  },
  async getMyLicenses() {
    const res = await client.get('/me/licenses');
    return res.data;
  },
  async getArtworkOwnership(id) {
    const res = await client.get(`/artworks/${id}/ownership`);
    return res.data;
  },
  async downloadArtwork(id) {
    const res = await client.get(`/artworks/${id}/download`);
    return res.data;
  },
  async generatePreview(parameters) {
    const res = await client.post('/artworks/generate', parameters);
    return res.data;
  },
  async deletePreview(payload: { publicId?: string; url?: string }) {
    const res = await client.post('/artworks/preview/delete', payload);
    return res.data;
  },

  // Users
  async getProfile(username) {
    return dedupedRequest(`users/${username}`, async () => {
      const res = await client.get(`/users/${username}`);
      return res.data;
    });
  },
  async updateProfile(payload) {
    const res = await client.put('/users/me', payload);
    return res.data;
  },
  async deleteAccount(password) {
    const res = await client.delete('/users/me', { data: { password } });
    return res.data;
  },
  async getUserLikedArtworks(username) {
    const res = await client.get(`/users/${username}/liked`);
    return res.data;
  },
  async getUserCollections(username) {
    const res = await client.get(`/users/${username}/collections`);
    return res.data;
  },
  async getUserArtworks(username) {
    const res = await client.get(`/users/${username}/artworks`);
    return res.data;
  },
  async searchUsers(q: string) {
    const res = await client.get('/users/search', { params: { q } });
    return res.data;
  },
  async follow(userId) {
    const res = await client.post(`/users/${userId}/follow`);
    return res.data;
  },
  async unfollow(userId) {
    const res = await client.delete(`/users/${userId}/follow`);
    return res.data;
  },
  async getNotifications() {
    return dedupedRequest('me/notifications', async () => {
      const res = await client.get('/me/notifications');
      return res.data;
    });
  },
  async markNotificationAsRead(id) {
    const res = await client.post(`/me/notifications/${id}/read`);
    return res.data;
  },
  async markAllNotificationsAsRead() {
    const res = await client.post('/me/notifications/read-all');
    return res.data;
  },
  async getDashboard() {
    const res = await client.get('/me/dashboard');
    return res.data;
  },
  async getMessageConversations() {
    const res = await client.get('/me/messages/conversations');
    return res.data;
  },
  async getConversationMessages(userId: string) {
    const res = await client.get(`/me/messages/${userId}`);
    return res.data;
  },
  async sendDirectMessage(receiverId: string, text: string) {
    const res = await client.post('/me/messages', { receiverId, text });
    return res.data;
  },
  async getAnalytics() {
    const res = await client.get('/me/analytics');
    return res.data;
  },
  async exportAnalytics() {
    const res = await client.get('/me/analytics/export', { responseType: 'blob' });
    return res.data;
  },
  async getRecentlyViewed(limit = 12) {
    const res = await client.get('/me/recently-viewed', { params: { limit } });
    return res.data;
  },
  async getTrendingTags(limit = 12) {
    const res = await client.get('/discovery/trending-tags', { params: { limit } });
    return res.data;
  },
  async getPopularSearches(limit = 8) {
    const res = await client.get('/discovery/popular-searches', { params: { limit } });
    return res.data;
  },
  async getActivityFeed(limit = 30) {
    const res = await client.get('/discovery/activity', { params: { limit } });
    return res.data;
  },
  async recordSearch(payload: { query?: string; tags?: string; category?: string }) {
    const res = await client.post('/discovery/search-log', payload);
    return res.data;
  },
  async getSavedSearches() {
    const res = await client.get('/me/saved-searches');
    return res.data;
  },
  async createSavedSearch(name: string, filters: unknown) {
    const res = await client.post('/me/saved-searches', { name, filters });
    return res.data;
  },
  async deleteSavedSearch(id: string) {
    const res = await client.delete(`/me/saved-searches/${id}`);
    return res.data;
  },
  async getMyBookmarkIds() {
    const res = await client.get('/me/bookmarks');
    return res.data?.artworkIds || [];
  },
  async getNotificationPrefs() {
    const res = await client.get('/me/notification-prefs');
    return res.data;
  },
  async updateNotificationPrefs(prefs) {
    const res = await client.put('/me/notification-prefs', prefs);
    return res.data;
  },
  async getPresets() {
    const res = await client.get('/presets');
    return res.data;
  },
  async createPreset(payload) {
    const res = await client.post('/presets', payload);
    return res.data;
  },
  async deletePreset(id) {
    const res = await client.delete(`/presets/${id}`);
    return res.data;
  },
  async submitReport(payload) {
    const res = await client.post('/reports', payload);
    return res.data;
  },
  async healthCheck() {
    const res = await client.get('/health');
    return res.data;
  },

  // Sessions
  async getSessions() {
    const res = await client.get('/sessions');
    return res.data;
  },
  async joinSession(id) {
    const res = await client.post(`/sessions/${id}/join`);
    return res.data;
  },
  async leaveSession(id) {
    const res = await client.post(`/sessions/${id}/leave`);
    return res.data;
  },
  async createSession(payload) {
    const res = await client.post('/sessions', payload);
    return res.data;
  },
};

export default api;

