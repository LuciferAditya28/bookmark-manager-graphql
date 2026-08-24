import { GraphQLScalarType, Kind, GraphQLError } from 'graphql';
import { ValidationError, NotFoundError } from '../validation/index.ts';
import {
  getFolders,
  getFolderById,
  createFolder,
  getBookmarksForFolder,
} from '../services/folder.service.ts';
import {
  createBookmark,
  updateBookmark,
  deleteBookmark,
  moveBookmark,
  getBookmarksPaginated,
  type CreateBookmarkInput,
  type UpdateBookmarkInput,
  type GetBookmarksArgs,
} from '../services/bookmark.service.ts';

const handleResolverError = (err: unknown): never => {
  if (err instanceof ValidationError) {
    throw new GraphQLError(err.message, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  if (err instanceof NotFoundError) {
    throw new GraphQLError(err.message, {
      extensions: { code: 'NOT_FOUND' },
    });
  }
  throw err;
};

export const DateTimeResolver = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',
  serialize(value) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value).toISOString();
    }
    return null;
  },
  parseValue(value) {
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }
    return null;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value, 10));
    }
    return null;
  },
});

export const resolvers = {
  DateTime: DateTimeResolver,
  Folder: {
    bookmarks: async (parent: { id: string }) => {
      return getBookmarksForFolder(parent.id);
    },
  },
  Bookmark: {
    folder: async (parent: { folderId: string }) => {
      const folder = await getFolderById(parent.folderId);
      if (!folder) {
        throw new GraphQLError(`Folder with ID "${parent.folderId}" not found`, {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return folder;
    },
  },
  Query: {
    folders: async () => {
      return getFolders();
    },
    folder: async (_: unknown, args: { id: string }) => {
      return getFolderById(args.id);
    },
    bookmarks: async (_: unknown, args: GetBookmarksArgs) => {
      try {
        return await getBookmarksPaginated(args);
      } catch (err) {
        return handleResolverError(err);
      }
    },
  },
  Mutation: {
    createFolder: async (_: unknown, args: { name: string }) => {
      try {
        return await createFolder(args.name);
      } catch (err) {
        return handleResolverError(err);
      }
    },
    createBookmark: async (_: unknown, args: { input: CreateBookmarkInput }) => {
      try {
        return await createBookmark(args.input);
      } catch (err) {
        return handleResolverError(err);
      }
    },
    updateBookmark: async (_: unknown, args: { id: string; input: UpdateBookmarkInput }) => {
      try {
        return await updateBookmark(args.id, args.input);
      } catch (err) {
        return handleResolverError(err);
      }
    },
    deleteBookmark: async (_: unknown, args: { id: string }) => {
      try {
        return await deleteBookmark(args.id);
      } catch (err) {
        return handleResolverError(err);
      }
    },
    moveBookmark: async (_: unknown, args: { id: string; folderId: string }) => {
      try {
        return await moveBookmark(args.id, args.folderId);
      } catch (err) {
        return handleResolverError(err);
      }
    },
  },
};
