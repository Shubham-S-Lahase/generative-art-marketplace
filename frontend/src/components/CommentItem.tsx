import React, { useEffect, useState } from 'react';
import { Heart, Reply, Trash2 } from 'lucide-react';
import { commentId, isCommentOwner } from '../utils/comments';

const mentionRegex = /(^|\s)(@[a-zA-Z0-9_]{3,30})/g;

const renderCommentText = (text = '') => {
  const lines = String(text).split('\n');
  return lines.map((line, lineIndex) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    line.replace(mentionRegex, (match, prefix, mention, offset) => {
      if (offset > lastIndex) {
        parts.push(line.slice(lastIndex, offset));
      }
      if (prefix) parts.push(prefix);
      parts.push(
        <span key={`${lineIndex}-${offset}-m`} className="text-indigo-600 dark:text-indigo-400 font-medium">
          {mention}
        </span>
      );
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }
    return (
      <React.Fragment key={`line-${lineIndex}`}>
        {parts.length ? parts : line}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </React.Fragment>
    );
  });
};

const CommentItem = ({
  comment,
  depth = 0,
  currentUser,
  editingId,
  replyingTo,
  commentActionId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleReply,
  onSubmitReply,
  onDelete,
  onToggleLike,
}) => {
  const cid = commentId(comment);
  const owner = isCommentOwner(comment, currentUser);
  const isEditing = editingId === cid;
  const isReplying = replyingTo === cid;
  const busy = commentActionId === cid;

  const [editText, setEditText] = useState('');
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    if (isEditing) {
      setEditText(comment.text || '');
    }
  }, [isEditing, comment.text]);

  useEffect(() => {
    if (!isReplying) {
      setReplyText('');
    }
  }, [isReplying]);

  return (
    <div className={depth > 0 ? 'ml-6 mt-3 border-l-2 border-gray-200 dark:border-gray-700 pl-4' : ''}>
      <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={2}
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => onSaveEdit(cid, editText)}
                disabled={busy || !editText.trim()}
                className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {renderCommentText(comment.text || '')}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
              <span>
                by {comment.username || 'Unknown User'}
                {comment.createdAt && (
                  <span className="ml-2">
                    • {new Date(comment.createdAt).toLocaleString()}
                    {comment.updatedAt &&
                      new Date(comment.updatedAt).getTime() > new Date(comment.createdAt).getTime() && (
                        <span className="ml-1">(edited)</span>
                      )}
                  </span>
                )}
              </span>
              {currentUser && (
                <button
                  onClick={() => onToggleLike(comment)}
                  disabled={busy}
                  className={`flex items-center gap-1 ${comment.liked ? 'text-red-500' : 'hover:text-red-500'}`}
                >
                  <Heart className={`h-3.5 w-3.5 ${comment.liked ? 'fill-current' : ''}`} />
                  <span>{comment.likes || 0}</span>
                </button>
              )}
              {!currentUser && (comment.likes || 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" />
                  {comment.likes}
                </span>
              )}
              {currentUser && (
                <button
                  onClick={() => onToggleReply(cid, isReplying)}
                  className="flex items-center gap-1 hover:text-indigo-600"
                >
                  <Reply className="h-3.5 w-3.5" />
                  Reply
                </button>
              )}
              {owner && (
                <>
                  <button onClick={() => onStartEdit(cid)} className="hover:text-indigo-600">
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(cid)}
                    disabled={busy}
                    className="flex items-center gap-1 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {isReplying && (
        <div className="mt-2 flex gap-2">
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply... (use @username to mention)"
            autoFocus
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmitReply(cid, replyText);
              }
            }}
          />
          <button
            onClick={() => onSubmitReply(cid, replyText)}
            disabled={!replyText.trim()}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            Reply
          </button>
        </div>
      )}

      {comment.replies?.map((reply) => (
        <CommentItem
          key={commentId(reply)}
          comment={reply}
          depth={depth + 1}
          currentUser={currentUser}
          editingId={editingId}
          replyingTo={replyingTo}
          commentActionId={commentActionId}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveEdit={onSaveEdit}
          onToggleReply={onToggleReply}
          onSubmitReply={onSubmitReply}
          onDelete={onDelete}
          onToggleLike={onToggleLike}
        />
      ))}
    </div>
  );
};

export default CommentItem;
