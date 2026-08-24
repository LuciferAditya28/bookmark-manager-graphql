import { createYoga, createSchema } from 'graphql-yoga';
import { typeDefs } from './schema/typeDefs.ts';
import { resolvers } from './resolvers/index.ts';

const yoga = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
});

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const server = Bun.serve({
  port,
  fetch: yoga.fetch,
});

console.log(`Server is running on http://localhost:${server.port}/graphql`);
