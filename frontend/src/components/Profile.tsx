import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, Globe, Calendar, Edit, Save, X, Camera, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import ArtworkCard from './ArtworkCard';
import api from '../services/api';
import { getImageUrl } from '../utils/helpers';
import type { Artwork, User } from '../types';

const normalizeArtworks = (list: Artwork[]) =>
  (Array.isArray(list) ? list : []).map((a) => ({
    ...a,
    id: a.id || a._id,
    files: { preview: getImageUrl(a.previewUrl || a.imageUrl) },
    previewUrl: getImageUrl(a.previewUrl || a.imageUrl),
    imageUrl: getImageUrl(a.imageUrl || a.previewUrl),
  }));

const Profile = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, logout } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [likedArtworks, setLikedArtworks] = useState<Artwork[]>([]);
  const [collectionArtworks, setCollectionArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'artworks' | 'liked' | 'collections'>('artworks');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmUsername, setDeleteConfirmUsername] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [editForm, setEditForm] = useState({
    bio: '',
    location: '',
    website: '',
    twitter: '',
    instagram: '',
    avatarData: '',
    coverImageData: '',
    avatarPreview: '',
    coverPreview: '',
  });
  const [notifPrefs, setNotifPrefs] = useState({
    likes: true,
    comments: true,
    follows: true,
    purchases: true,
  });

  const isOwnProfile = currentUser?.username === username;

  const loadProfile = useCallback(async () => {
    if (!username) return;
    try {
      setLoading(true);
      const profileRes = await api.getProfile(username);
      setProfile(profileRes);
      setEditForm({
        bio: profileRes.profile?.bio || '',
        location: profileRes.profile?.location || '',
        website: profileRes.profile?.website || '',
        twitter: profileRes.profile?.twitter || '',
        instagram: profileRes.profile?.instagram || '',
        avatarData: '',
        coverImageData: '',
        avatarPreview: getImageUrl(profileRes.profile?.avatar) || '',
        coverPreview: getImageUrl(profileRes.profile?.coverImage) || '',
      });
      if (isOwnProfile && currentUser) {
        api.getNotificationPrefs().then(setNotifPrefs).catch(() => {});
      }

      const artworksRes = await api.getUserArtworks(username);
      setArtworks(normalizeArtworks(artworksRes));
    } catch (error) {
      console.error('Error loading profile:', error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const loadTabData = useCallback(async () => {
    if (!username || !profile) return;

    if (activeTab === 'artworks') return;

    try {
      setTabLoading(true);
      if (activeTab === 'liked') {
        const data = await api.getUserLikedArtworks(username);
        setLikedArtworks(normalizeArtworks(data));
      } else if (activeTab === 'collections') {
        const data = await api.getUserCollections(username);
        setCollectionArtworks(normalizeArtworks(data));
      }
    } catch (error) {
      console.error('Error loading tab:', error);
      if (activeTab === 'liked') setLikedArtworks([]);
      if (activeTab === 'collections') setCollectionArtworks([]);
    } finally {
      setTabLoading(false);
    }
  }, [activeTab, username, profile]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  const handleFollow = async () => {
    if (!currentUser || !profile || isOwnProfile) return;
    const profileId = profile.id || profile._id;
    try {
      if (profile.isFollowing) {
        await api.unfollow(profileId);
      } else {
        await api.follow(profileId);
      }
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: !prev.isFollowing,
              stats: {
                ...prev.stats,
                followersCount: (prev.stats?.followersCount || 0) + (prev.isFollowing ? -1 : 1),
              },
            }
          : prev
      );
    } catch (error) {
      console.error('Error toggling follow:', error);
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleImagePick = async (file: File | undefined, field: 'avatar' | 'cover') => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (field === 'avatar') {
        setEditForm((prev) => ({ ...prev, avatarData: dataUrl, avatarPreview: dataUrl }));
      } else {
        setEditForm((prev) => ({ ...prev, coverImageData: dataUrl, coverPreview: dataUrl }));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to read image');
    }
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      const payload: Record<string, string> = {
        bio: editForm.bio,
        location: editForm.location,
        website: editForm.website,
        twitter: editForm.twitter,
        instagram: editForm.instagram,
      };
      if (editForm.avatarData) payload.avatarData = editForm.avatarData;
      if (editForm.coverImageData) payload.coverImageData = editForm.coverImageData;

      const updated = await api.updateProfile(payload);
      setProfile(updated);
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              profile: updated.profile,
            }
          : prev
      );
      setIsEditing(false);
      setEditForm((prev) => ({
        ...prev,
        avatarData: '',
        coverImageData: '',
        avatarPreview: getImageUrl(updated.profile?.avatar) || prev.avatarPreview,
        coverPreview: getImageUrl(updated.profile?.coverImage) || prev.coverPreview,
      }));
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!profile?.username) return;
    if (deleteConfirmUsername !== profile.username) {
      setDeleteError('Username does not match.');
      return;
    }
    if (!deletePassword.trim()) {
      setDeleteError('Enter your password to confirm.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deleteAccount(deletePassword);
      await logout();
      navigate('/');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setDeleteError(e?.response?.data?.error || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const openDeleteModal = () => {
    setDeletePassword('');
    setDeleteConfirmUsername('');
    setDeleteError('');
    setShowDeleteModal(true);
  };

  const cancelEdit = () => {
    if (!profile) return;
    setEditForm({
      bio: profile.profile?.bio || '',
      location: profile.profile?.location || '',
      website: profile.profile?.website || '',
      twitter: profile.profile?.twitter || '',
      instagram: profile.profile?.instagram || '',
      avatarData: '',
      coverImageData: '',
      avatarPreview: getImageUrl(profile.profile?.avatar) || '',
      coverPreview: getImageUrl(profile.profile?.coverImage) || '',
    });
    setIsEditing(false);
  };

  const currentItems =
    activeTab === 'artworks'
      ? artworks
      : activeTab === 'liked'
        ? likedArtworks
        : collectionArtworks;

  const emptyMessages: Record<string, string> = {
    artworks: 'No artworks published yet.',
    liked: 'No liked artworks yet.',
    collections: isOwnProfile
      ? 'No saved artworks yet. Bookmark pieces from the gallery or marketplace.'
      : 'Collections are private.',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">User not found</h2>
      </div>
    );
  }

  const avatarSrc =
    editForm.avatarPreview ||
    getImageUrl(profile.profile?.avatar) ||
    `https://ui-avatars.com/api/?name=${profile.username}&background=6366f1&color=fff`;

  const coverSrc = editForm.coverPreview || getImageUrl(profile.profile?.coverImage);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="h-48 md:h-64 bg-gradient-to-r from-indigo-500 to-purple-600 relative overflow-hidden">
        {coverSrc && <img src={coverSrc} alt="Cover" className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-black/20" />
        {isOwnProfile && isEditing && (
          <label className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-2 bg-black/50 text-white text-sm rounded-lg cursor-pointer hover:bg-black/70">
            <Camera className="h-4 w-4" />
            Change cover
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImagePick(e.target.files?.[0], 'cover')}
            />
          </label>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative -mt-16 md:-mt-20 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-end gap-6">
              <div className="relative shrink-0">
                <img
                  src={avatarSrc}
                  alt={profile.username}
                  className="w-24 h-24 md:w-28 md:h-28 rounded-full border-4 border-white dark:border-gray-800 object-cover"
                />
                {isOwnProfile && isEditing && (
                  <label className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full cursor-pointer hover:bg-indigo-700 shadow">
                    <Camera className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImagePick(e.target.files?.[0], 'avatar')}
                    />
                  </label>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.username}</h1>
                    <p className="text-gray-600 dark:text-gray-300">@{profile.username}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isOwnProfile && !isEditing && (
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                      >
                        <Edit className="h-4 w-4" />
                        Edit profile
                      </button>
                    )}
                    {isOwnProfile && isEditing && (
                      <>
                        <button
                          type="button"
                          onClick={handleSaveProfile}
                          disabled={saving}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg"
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </button>
                      </>
                    )}
                    {!isOwnProfile && currentUser && (
                      <button
                        type="button"
                        onClick={handleFollow}
                        className={`px-6 py-2 rounded-lg font-medium ${
                          profile.isFollowing
                            ? 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        {profile.isFollowing ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-4 space-y-3">
                    <textarea
                      value={editForm.bio}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, bio: e.target.value }))}
                      placeholder="Bio"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                    />
                    <input
                      value={editForm.location}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, location: e.target.value }))}
                      placeholder="Location"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                    />
                    <input
                      value={editForm.website}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, website: e.target.value }))}
                      placeholder="Website URL"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                    />
                    <input
                      value={editForm.twitter}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, twitter: e.target.value }))}
                      placeholder="Twitter / X handle"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                    />
                    <input
                      value={editForm.instagram}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, instagram: e.target.value }))}
                      placeholder="Instagram handle"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                    />
                  </div>
                ) : (
                  <>
                    {profile.profile?.bio && (
                      <p className="mt-3 text-gray-700 dark:text-gray-300">{profile.profile.bio}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
                      {profile.profile?.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          <span>{profile.profile.location}</span>
                        </div>
                      )}
                      {profile.profile?.website && (
                        <div className="flex items-center gap-1">
                          <Globe className="h-4 w-4" />
                          <a
                            href={
                              profile.profile.website.startsWith('http')
                                ? profile.profile.website
                                : `https://${profile.profile.website}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                          >
                            Website
                          </a>
                        </div>
                      )}
                      {profile.profile?.twitter && (
                        <a
                          href={`https://twitter.com/${profile.profile.twitter.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                        >
                          @{profile.profile.twitter.replace('@', '')}
                        </a>
                      )}
                      {profile.profile?.instagram && (
                        <a
                          href={`https://instagram.com/${profile.profile.instagram.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                        >
                          @{profile.profile.instagram.replace('@', '')}
                        </a>
                      )}
                      {profile.createdAt && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>Joined {new Date(profile.createdAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Artworks', value: profile.stats?.artworksCreated ?? 0 },
            { label: 'Views', value: (profile.stats?.totalViews ?? 0).toLocaleString() },
            { label: 'Likes', value: (profile.stats?.totalLikes ?? 0).toLocaleString() },
            { label: 'Followers', value: profile.stats?.followersCount ?? 0 },
            { label: 'Following', value: profile.stats?.followingCount ?? 0 },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 text-center"
            >
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="border-b border-gray-200 dark:border-gray-700 mb-8">
          <nav className="-mb-px flex space-x-8">
            {(
              [
                { id: 'artworks', label: 'Artworks' },
                { id: 'liked', label: 'Liked' },
                {
                  id: 'collections',
                  label: isOwnProfile ? 'Saved' : 'Bookmarks',
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="pb-12">
          {tabLoading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
            </div>
          ) : currentItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {currentItems.map((artwork) => (
                <ArtworkCard key={artwork.id} artwork={artwork} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-600 dark:text-gray-300">
              {emptyMessages[activeTab]}
            </div>
          )}
        </div>

        {isOwnProfile && (
          <div className="mt-12 border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Notification preferences</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {(['likes', 'comments', 'follows', 'purchases'] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-gray-700 dark:text-gray-300 capitalize">
                  <input
                    type="checkbox"
                    checked={notifPrefs[key] !== false}
                    onChange={(e) => setNotifPrefs((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="rounded border-gray-300 text-indigo-600"
                  />
                  {key}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await api.updateNotificationPrefs(notifPrefs);
                  alert('Preferences saved');
                } catch {
                  alert('Failed to save preferences');
                }
              }}
              className="mt-4 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Save notification settings
            </button>
          </div>
        )}

        {isOwnProfile && (
          <div className="mt-8 border border-red-200 dark:border-red-900/50 rounded-lg p-6 bg-red-50/50 dark:bg-red-950/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-200">Delete account</h3>
                <p className="mt-1 text-sm text-red-800/90 dark:text-red-300/90">
                  Permanently removes your profile, likes, bookmarks, and unsold artworks. Sold pieces stay
                  available to buyers. This cannot be undone.
                </p>
                <button
                  type="button"
                  onClick={openDeleteModal}
                  className="mt-4 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Delete my account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showDeleteModal && profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl p-6"
            role="dialog"
            aria-labelledby="delete-account-title"
          >
            <h2 id="delete-account-title" className="text-xl font-bold text-gray-900 dark:text-white">
              Delete account?
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Type <span className="font-mono font-semibold">{profile.username}</span> and your password to
              confirm.
            </p>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={deleteConfirmUsername}
                onChange={(e) => setDeleteConfirmUsername(e.target.value)}
                placeholder="Username"
                autoComplete="off"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
              />
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
              />
              {deleteError && (
                <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>
              )}
            </div>
            <div className="mt-6 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={
                  deleting ||
                  deleteConfirmUsername !== profile.username ||
                  !deletePassword.trim()
                }
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
