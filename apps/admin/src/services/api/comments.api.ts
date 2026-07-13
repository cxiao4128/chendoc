import {
  deleteCommentAdmin,
  deleteCommentsBatch,
  listAllComments
} from "../../api/comments-admin";
import {
  createDocComment,
  deleteDocComment,
  listDocComments,
  toggleCommentReaction,
  updateDocComment
} from "../../api/comments";

export type {
  ListCommentsOptions,
  ListCommentsResult
} from "../../api/comments-admin";
export type {
  Comment,
  CreateCommentInput,
  Reaction,
  UpdateCommentInput
} from "../../api/comments";

export const commentsApi = {
  listAdmin: listAllComments,
  deleteAdmin: deleteCommentAdmin,
  deleteBatchAdmin: deleteCommentsBatch,
  listDoc: listDocComments,
  createDoc: createDocComment,
  updateDoc: updateDocComment,
  deleteDoc: deleteDocComment,
  toggleReaction: toggleCommentReaction
};
