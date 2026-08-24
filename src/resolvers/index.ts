import { GraphQLScalarType, Kind } from 'graphql';

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
  Query: {
    folders: () => [],
    folder: () => null,
    bookmarks: () => ({
      nodes: [],
      nextCursor: null,
      hasNextPage: false,
    }),
  },
  Mutation: {
    createFolder: () => {
      throw new Error('Not implemented');
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
