import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2, ArrowLeft, Edit, X, Save, ShoppingCart, Shield, Download, Flag, BadgeCheck } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { getImageUrl } from '../utils/helpers';
import { buildCommentTree, commentId } from '../utils/comments';
import CommentItem from './CommentItem';
import MockCheckoutModal from './MockCheckoutModal';
import { isSameUser } from '../utils/userId';

const ArtworkDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [artwork, setArtwork] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [commentActionId, setCommentActionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liking, setLiking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [ownership, setOwnership] = useState({ owned: false, license: '', terms: '' });
  const [checkoutLicense, setCheckoutLicense] = useState(null);
  const [editData, setEditData] = useState({
    title: '',
    description: '',
    tags: '',
    isPublic: true,
    marketplace: {
      forSale: false,
      price: 0,
      licensing: ['personal', 'commercial'] as string[],
    },
  });

  const LICENSE_OPTIONS = ['personal', 'commercial', 'exclusive'];

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        const [art, comm] = await Promise.all([api.getArtwork(id), api.getComments(id)]);
        if (cancelled) return;
        setArtwork(art);
        setComments(Array.isArray(comm) ? comm : []);

        if (currentUser) {
          try {
            const own = await api.getArtworkOwnership(id);
            if (!cancelled) setOwnership(own);
          } catch {
            if (!cancelled) setOwnership({ owned: false, license: '', terms: '' });
          }
        }

        const viewKey = `artwork-view:${id}`;
        if (!sessionStorage.getItem(viewKey)) {
          sessionStorage.setItem(viewKey, '1');
          try {
            const viewRes = await api.recordArtworkView(id);
            if (!cancelled && viewRes?.counted) {
              setArtwork((prev) =>
                prev
                  ? {
                      ...prev,
                      metrics: {
                        ...(prev.metrics || {}),
                        views: viewRes.views ?? (prev.metrics?.views || 0) + 1,
                      },
                    }
                  : prev
              );
            }
          } catch (viewErr) {
            sessionStorage.removeItem(viewKey);
            console.error('Failed to record view:', viewErr);
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setComments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [art, comm] = await Promise.all([api.getArtwork(id), api.getComments(id)]);
      setArtwork(art);
      setComments(Array.isArray(comm) ? comm : []);
    } catch (err) {
      console.error(err);
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!currentUser) return;
    setLiking(true);
    try {
      await api.likeArtwork(id);
      setArtwork((prev) => prev ? { ...prev, metrics: { ...(prev.metrics || {}), likes: (prev.metrics?.likes || 0) + 1 } } : prev);
    } catch (err) {
      console.error(err);
    } finally {
      setLiking(false);
    }
  };

  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);

  const handleComment = async (text, parentId = null) => {
    if (!currentUser || !text.trim()) return;
    try {
      await api.addComment(id, text.trim(), parentId);
      if (parentId) {
        setReplyingTo(null);
      } else {
        setCommentText('');
      }
      loadData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to post comment');
    }
  };

  const handleUpdateComment = async (commentIdToUpdate, text) => {
    if (!text.trim()) return;
    try {
      setCommentActionId(commentIdToUpdate);
      await api.updateComment(id, commentIdToUpdate, text.trim());
      setEditingId(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to update comment');
    } finally {
      setCommentActionId(null);
    }
  };

  const handleDeleteComment = async (commentIdToDelete) => {
    if (!window.confirm('Delete this comment and all its replies?')) return;
    try {
      setCommentActionId(commentIdToDelete);
      const result = await api.deleteComment(id, commentIdToDelete);
      const deleted = result?.deletedCount ?? 1;
      setArtwork((prev) =>
        prev
          ? {
              ...prev,
              metrics: {
                ...(prev.metrics || {}),
                comments: Math.max(0, (prev.metrics?.comments || 0) - deleted),
              },
            }
          : prev
      );
      loadData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to delete comment');
    } finally {
      setCommentActionId(null);
    }
  };

  const handleToggleCommentLike = async (comment) => {
    if (!currentUser) return;
    const cid = commentId(comment);
    try {
      setCommentActionId(cid);
      if (comment.liked) {
        await api.unlikeComment(id, cid);
      } else {
        await api.likeComment(id, cid);
      }
      setComments((prev) =>
        prev.map((c) => {
          if (commentId(c) !== cid) return c;
          const likes = (c.likes || 0) + (c.liked ? -1 : 1);
          return { ...c, likes: Math.max(0, likes), liked: !c.liked };
        })
      );
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to update reaction');
    } finally {
      setCommentActionId(null);
    }
  };

  const handleRemix = () => {
    navigate('/create', {
      state: {
        parameters: artwork.parameters,
        title: `Remix of ${artwork.title}`,
        remixOf: artwork.id || artwork._id,
      },
    });
  };

  const handleReport = async () => {
    if (!currentUser) return;
    const reason = window.prompt('Why are you reporting this artwork?', 'inappropriate');
    if (!reason) return;
    try {
      await api.submitReport({
        targetType: 'artwork',
        targetId: id,
        reason,
        details: '',
      });
      alert('Report submitted. Thank you.');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit report');
    }
  };

  usePageMeta({
    title: artwork?.title,
    description: artwork?.description?.slice(0, 160),
    image: artwork ? getImageUrl(artwork.previewUrl || artwork.imageUrl) : undefined,
  });

  const handleEdit = () => {
    setEditData({
      title: artwork.title || '',
      description: artwork.description || '',
      tags: Array.isArray(artwork.tags) ? artwork.tags.join(', ') : '',
      isPublic: artwork.isPublic !== false,
      marketplace: {
        forSale: artwork.marketplace?.forSale || false,
        price: artwork.marketplace?.price || 0,
        licensing:
          Array.isArray(artwork.marketplace?.licensing) && artwork.marketplace.licensing.length > 0
            ? artwork.marketplace.licensing
            : ['standard'],
      },
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    try {
      const payload = {
        title: editData.title,
        description: editData.description,
        tags: editData.tags.split(',').map(t => t.trim()).filter(t => t),
        isPublic: editData.isPublic,
        marketplace: editData.marketplace,
        parameters: artwork.parameters || {} // Include existing parameters (required by backend)
      };
      await api.updateArtwork(id, payload);
      setArtwork(prev => prev ? { ...prev, ...payload } : prev);
      setIsEditing(false);
      alert('Artwork updated successfully!');
    } catch (error) {
      console.error('Error updating artwork:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to update artwork';
      alert(`Failed to update artwork: ${errorMessage}`);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const toggleEditLicense = (license: string) => {
    setEditData((prev) => {
      const current = prev.marketplace.licensing || [];
      const next = current.includes(license)
        ? current.filter((l) => l !== license)
        : [...current, license];
      return {
        ...prev,
        marketplace: {
          ...prev.marketplace,
          licensing: next.length > 0 ? next : ['standard'],
        },
      };
    });
  };

  const handleBuy = (license: string) => {
    if (!currentUser || !id) return;
    if (isSameUser(artwork?.userId, currentUser)) {
      alert('You cannot purchase your own artwork.');
      return;
    }
    setCheckoutLicense(license);
  };

  const handleDownload = async () => {
    try {
      const res = await api.downloadArtwork(id);
      if (res.downloadUrl) window.open(res.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      alert('Download not available');
    }
  };

  const isOwner = currentUser && artwork && (currentUser.id === artwork.userId || currentUser._id === artwork.userId);

  if (loading) {
    return <div className="p-6 text-gray-500">Loading...</div>;
  }

  if (!artwork) {
    return <div className="p-6 text-gray-500">Artwork not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <button onClick={() => navigate(-1)} className="flex items-center text-sm text-gray-600 dark:text-gray-300 mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="bg-black/5 dark:bg-black/30 flex items-center justify-center min-h-[400px] max-h-[600px] overflow-hidden">
              <img 
                src={getImageUrl(artwork.previewUrl || artwork.imageUrl)} 
                alt={artwork.title} 
                className="w-full h-full max-w-full max-h-full object-contain"
              />
            </div>
            <div className="p-6 space-y-4">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                    <input
                      type="text"
                      value={editData.title}
                      onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                    <textarea
                      value={editData.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (comma-separated)</label>
                    <input
                      type="text"
                      value={editData.tags}
                      onChange={(e) => setEditData({ ...editData, tags: e.target.value })}
                      placeholder="abstract, colorful, modern"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="isPublic"
                      checked={editData.isPublic}
                      onChange={(e) => setEditData({ ...editData, isPublic: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor="isPublic" className="text-sm text-gray-700 dark:text-gray-300">Make public</label>
                  </div>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Marketplace</h4>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="forSale"
                          checked={editData.marketplace.forSale}
                          onChange={(e) => setEditData({ 
                            ...editData, 
                            marketplace: { ...editData.marketplace, forSale: e.target.checked }
                          })}
                          className="rounded"
                        />
                        <label htmlFor="forSale" className="text-sm text-gray-700 dark:text-gray-300">List for sale</label>
                      </div>
                      {editData.marketplace.forSale && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Price ($)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editData.marketplace.price}
                              onChange={(e) =>
                                setEditData({
                                  ...editData,
                                  marketplace: {
                                    ...editData.marketplace,
                                    price: parseFloat(e.target.value) || 0,
                                  },
                                })
                              }
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Offered licenses
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {LICENSE_OPTIONS.map((lic) => (
                                <label key={lic} className="flex items-center gap-1 text-sm capitalize">
                                  <input
                                    type="checkbox"
                                    checked={editData.marketplace.licensing?.includes(lic)}
                                    onChange={() => toggleEditLicense(lic)}
                                    className="rounded"
                                  />
                                  {lic}
                                </label>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSaveEdit}
                      className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      <Save className="h-4 w-4" />
                      <span>Save</span>
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex items-center space-x-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                      <X className="h-4 w-4" />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                        {artwork.title}
                        {artwork.isVerified && (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400">
                            <BadgeCheck className="h-5 w-5" /> Verified
                          </span>
                        )}
                      </h1>
                      {artwork.remixOfTitle && (
                        <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-1">
                          Remix of {artwork.remixOfTitle}
                        </p>
                      )}
                      <p className="text-gray-600 dark:text-gray-300 mt-2">{artwork.description}</p>
                    </div>
                    {isOwner && (
                      <button
                        onClick={handleEdit}
                        className="flex items-center space-x-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                      >
                        <Edit className="h-4 w-4" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              <div className="flex items-center space-x-4">
                <button
                  onClick={handleLike}
                  disabled={!currentUser || liking}
                  className="flex items-center space-x-1 text-gray-700 dark:text-gray-200"
                >
                  <Heart className="h-5 w-5" /> <span>{artwork.metrics?.likes || 0}</span>
                </button>
                <div className="flex items-center space-x-1 text-gray-700 dark:text-gray-200">
                  <MessageCircle className="h-5 w-5" /> <span>{artwork.metrics?.comments || 0}</span>
                </div>
                <button className="flex items-center space-x-1 text-gray-700 dark:text-gray-200" onClick={() => navigator.share?.({ title: artwork.title, url: window.location.href })}>
                  <Share2 className="h-5 w-5" /> <span>Share</span>
                </button>
                {currentUser && !isOwner && (
                  <button
                    type="button"
                    onClick={handleReport}
                    className="flex items-center space-x-1 text-gray-500 hover:text-red-600"
                  >
                    <Flag className="h-5 w-5" /> <span>Report</span>
                  </button>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-2">Parameters</h3>
                <pre className="bg-gray-100 dark:bg-gray-900 text-xs p-3 rounded">{JSON.stringify(artwork.parameters, null, 2)}</pre>
              </div>

              {ownership.owned && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 text-green-800 dark:text-green-300 font-medium">
                    <Shield className="h-5 w-5" />
                    Licensed — {ownership.license}
                    {ownership.terms ? ` — ${ownership.terms.slice(0, 100)}${ownership.terms.length > 100 ? '…' : ''}` : ''}
                  </div>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="mt-3 inline-flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                  >
                    <Download className="h-4 w-4" /> Download
                  </button>
                </div>
              )}

              {!isOwner &&
                !isSameUser(artwork.userId, currentUser) &&
                artwork.marketplace?.forSale &&
                !ownership.owned &&
                currentUser && (
                <div className="p-4 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                  <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    ${artwork.marketplace.price}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(artwork.marketplace.licensing?.length
                      ? artwork.marketplace.licensing
                      : ['standard']
                    ).map((lic) => (
                      <button
                        key={lic}
                        type="button"
                        onClick={() => handleBuy(lic)}
                        className="inline-flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 capitalize"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Buy {lic}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex space-x-2">
                <button onClick={handleRemix} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">
                  Remix
                </button>
              </div>
            </div>
          </div>
        </div>

        {checkoutLicense && artwork && (
          <MockCheckoutModal
            artwork={{
              id: artwork.id || artwork._id || id,
              title: artwork.title,
              previewUrl: artwork.previewUrl,
              imageUrl: artwork.imageUrl,
              marketplace: artwork.marketplace,
            }}
            license={checkoutLicense}
            onClose={() => setCheckoutLicense(null)}
            onSuccess={async () => {
              const own = await api.getArtworkOwnership(id);
              setOwnership(own);
              alert('Purchase successful!');
            }}
          />
        )}

        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
            Comments {artwork.metrics?.comments ? `(${artwork.metrics.comments})` : ''}
          </h3>
          <div className="space-y-3">
            {commentTree.length > 0 ? (
              commentTree.map((c) => (
                <CommentItem
                  key={commentId(c)}
                  comment={c}
                  currentUser={currentUser}
                  editingId={editingId}
                  replyingTo={replyingTo}
                  commentActionId={commentActionId}
                  onStartEdit={(cid) => {
                    setEditingId(cid);
                    setReplyingTo(null);
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={handleUpdateComment}
                  onToggleReply={(cid, isOpen) => {
                    setReplyingTo(isOpen ? null : cid);
                    setEditingId(null);
                  }}
                  onSubmitReply={(cid, text) => handleComment(text, cid)}
                  onDelete={handleDeleteComment}
                  onToggleLike={handleToggleCommentLike}
                />
              ))
            ) : (
              <p className="text-sm text-gray-500">No comments yet. Be the first to comment!</p>
            )}
          </div>
          {currentUser ? (
            <div className="mt-4 flex space-x-2">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleComment(commentText);
                  }
                }}
              />
              <button
                onClick={() => handleComment(commentText)}
                disabled={!commentText.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50"
              >
                Post
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">Sign in to comment, reply, and react.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArtworkDetail;

