import { GraphQLScalarType, Kind, GraphQLError } from 'graphql';
import { ValidationError } from '../validation/index.ts';
import {
  getFolders,
  getFolderById,
  createFolder,
  getBookmarksForFolder,
} from '../services/folder.service.ts';

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
  Query: {
    folders: async () => {
      return getFolders();
    },
    folder: async (_: unknown, args: { id: string }) => {
      return getFolderById(args.id);
    },
    bookmarks: () => ({
      nodes: [],
      nextCursor: null,
      hasNextPage: false,
    }),
  },
  Mutation: {
    createFolder: async (_: unknown, args: { name: string }) => {
      try {
        return await createFolder(args.name);
      } catch (err) {
        if (err instanceof ValidationError) {
          throw new GraphQLError(err.message, {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        throw err;
      }
    },
    createBookmark: () => {
      throw new Error('Not implemented');
    },
    updateBookmark: () => {
      throw new Error('Not implemented');
    },
    deleteBookmark: () => {
      throw new Error('Not implemented');
    },
    moveBookmark: () => {
      throw new Error('Not implemented');
    },
  },
};
