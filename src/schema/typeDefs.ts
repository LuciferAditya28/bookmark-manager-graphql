import { readFileSync } from 'fs';
import { join } from 'path';

export const typeDefs = readFileSync(join(import.meta.dir, 'schema.graphql'), 'utf-8');
