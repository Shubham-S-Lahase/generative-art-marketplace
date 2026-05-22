export function commentId(comment) {
  const id = comment?._id ?? comment?.id;
  return id ? String(id) : '';
}

export function buildCommentTree(comments) {
  if (!Array.isArray(comments)) return [];

  const nodes = {};
  const roots = [];

  comments.forEach((comment) => {
    const id = commentId(comment);
    nodes[id] = { ...comment, replies: [] };
  });

  comments.forEach((comment) => {
    const id = commentId(comment);
    const parentId = comment.parentId ? String(comment.parentId) : null;
    if (parentId && nodes[parentId]) {
      nodes[parentId].replies.push(nodes[id]);
    } else if (!parentId) {
      roots.push(nodes[id]);
    }
  });

  return roots;
}

export function isCommentOwner(comment, currentUser) {
  if (!currentUser || !comment) return false;
  const ownerId = String(comment.userId ?? '');
  const userId = String(currentUser.id ?? currentUser._id ?? '');
  return ownerId !== '' && ownerId === userId;
}
