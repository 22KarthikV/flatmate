// Decides which buttons to show. The database enforces the same rules; this only hides the rest.

export interface Viewer {
  profileId: string;
  isAdmin: boolean;
}

export function canDeletePost(post: { authorId: string }, viewer: Viewer): boolean {
  return viewer.isAdmin || post.authorId === viewer.profileId;
}

export function canPin(viewer: Viewer): boolean {
  return viewer.isAdmin;
}
