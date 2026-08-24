import { describe, it, expect } from 'bun:test';
import { createYoga, createSchema } from 'graphql-yoga';
import { typeDefs } from './schema/typeDefs.ts';
import { resolvers } from './resolvers/index.ts';

const yoga = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
});

describe('GraphQL Yoga Server', () => {
  it('responds successfully to the folders query', async () => {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: '{ folders { id name } }',
      }),
    });

    expect(response.status).toBe(200);
    
    // Explicit type casting to avoid implicit or explicit 'any'
    const result = (await response.json()) as { data?: { folders: Array<{ id: string; name: string }> } };
    
    expect(result.data).toBeDefined();
    expect(result.data?.folders).toEqual([]);
  });
});
