# Bookmark Manager GraphQL API Walkthrough

This walkthrough documents the completed Bookmark Manager GraphQL API for evaluator review.

---

## 1. Project Overview
This project is a back-end GraphQL API designed to organize web bookmarks into folders. It resolves core problems surrounding folder structure hierarchy, bookmark CRUD and tag lists, substring searching, deterministic keyset-based cursor pagination, strict input validation, and structured error propagation.

---

## 2. Assignment Requirements Covered
Every requirement specified in the assignment has been implemented and verified:
*   **Bun**: Used as the runtime, lockfile package manager, and test runner.
*   **TypeScript Strict Mode**: Configured with `"strict": true` in `tsconfig.json` and zero explicit `any` casts.
*   **GraphQL Yoga & Schema-First Schema**: Dynamic schemas parsed from a dedicated `.graphql` file definition.
*   **PostgreSQL & Prisma**: Complete database support using Prisma Client mapping to PostgreSQL 16 Alpine.
*   **Folder and Bookmark CRUD**: Unified mutations supporting creation, retrieval, updates, deletions, and moves.
*   **Search**: Title substring queries with case-insensitive support.
*   **Cursor Pagination**: Opaque Base64 cursors using deterministic `createdAt DESC, id DESC` keyset pagination.
*   **Error Mappings**: Replaces raw database errors with clean `BAD_USER_INPUT` and `NOT_FOUND` GraphQL error extensions.
*   **Testing**: Unit tests and real PostgreSQL integration tests checking page traversals and tie-breaker sorting.
*   **CI Setup**: GitHub Actions workflows integrating PostgreSQL 16 and a local sanity checking script.

---

## 3. Tech Stack
*   **Runtime**: [Bun](https://bun.sh/) (v1.4.0)
*   **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
*   **GraphQL Server**: [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) (v5.22.0)
*   **Database ORM**: [Prisma](https://www.prisma.io/) (v6.19.3)
*   **Database**: [PostgreSQL 16 Alpine](https://www.postgresql.org/)
*   **Environment**: [Docker Compose](https://docs.docker.com/compose/)

---

## 4. Project Structure
The repository is structured as follows:
```
├── .github/workflows/         # CI/CD GitHub Actions Configurations
│   └── ci.yml                 # Pinned Bun & PG Service CI pipeline
├── prisma/                    # Prisma DB Settings & Migrations
│   ├── schema.prisma          # Prisma schema defining Folder & Bookmark
│   └── migrations/            # SQL migration history scripts
├── src/
│   ├── db/
│   │   └── client.ts          # Database Client singletons
│   ├── resolvers/
│   │   ├── index.ts           # GraphQL Resolvers, Date parsing, & Error handlers
│   │   ├── folder.test.ts     # Folder resolvers unit test suite
│   │   ├── bookmark.test.ts   # Bookmark resolvers unit test suite
│   │   └── bookmarks-integration.test.ts # PostgreSQL Integration tests
│   ├── schema/
│   │   ├── schema.graphql     # Schema-first GraphQL contract
│   │   └── typeDefs.ts        # GraphQL Type definitions loader
│   ├── services/
│   │   ├── folder.service.ts  # Folder database operations
│   │   └── bookmark.service.ts # Bookmark database operations
│   ├── validation/
│   │   └── index.ts           # Input validators & cursor encoders
│   └── index.ts               # Yoga server listener entrypoint
```

---

## 5. Database Design / Prisma Schema
Relational model definitions inside `prisma/schema.prisma`:
*   **Folder**:
    *   `id`: Primary key (UUIDv4).
    *   `name`: Folder string name.
    *   `createdAt`: Timestamp of creation.
*   **Bookmark**:
    *   `id`: Primary key (UUIDv4).
    *   `title`: Bookmark title.
    *   `url`: Sanitized HTTP/HTTPS web address.
    *   `tags`: String array (`String[]` mapping to standard `text[]` in PostgreSQL).
    *   `folderId`: Foreign Key referencing `folders.id` with cascade deletion (`onDelete: Cascade` on folder removal).
    *   `createdAt`: Timestamp of creation.

### Database Indexing
*   Single-column index on `Bookmark.folderId` to optimize folder relationship fetches.
*   Composite index on `Bookmark(createdAt, id)` to optimize keyset cursor pagination lookups.

---

## 6. GraphQL Schema and API Operations
Definitions located in `src/schema/schema.graphql`:
*   **Queries**:
    *   `folders: [Folder!]!`: Retrieve all folders.
    *   `folder(id: ID!): Folder`: Fetch single folder with child bookmarks.
    *   `bookmarks(folderId: ID, search: String, take: Int, cursor: String): BookmarkConnection!`: Page-based search and filter bookmarks.
*   **Mutations**:
    *   `createFolder(name: String!): Folder!`
    *   `createBookmark(input: CreateBookmarkInput!): Bookmark!`
    *   `updateBookmark(id: ID!, input: UpdateBookmarkInput!): Bookmark!`
    *   `deleteBookmark(id: ID!): Bookmark!`
    *   `moveBookmark(id: ID!, folderId: ID!): Bookmark!`

---

## 7. Folder Functionality
*   **Creation & Validations**: Rejects empty or whitespace-only folder names.
*   **Relationship Nesting**: Folder records support resolving children bookmarks through the `Folder.bookmarks` resolver, returning a list of child bookmarks or `[]` if none exist.
*   **Deterministic Sorting**: Folders are sorted by `createdAt ASC, id ASC`.

---

## 8. Bookmark CRUD and Move Operations
*   **Creation**: Requires a valid parent folder ID. Validates title and URL protocol before insertion. Supports tags (defaulting to `[]` when omitted).
*   **Updates**: Supports partial updates (e.g. updating title only, tags only, URL only, or a combination).
*   **Move**: Reassigns `folderId` to a new destination folder after confirming both bookmark and folder exist.
*   **Delete**: Deletes the bookmark and returns the deleted node representation.

---

## 9. Search and Cursor-Based Pagination
*   **Search**: Bookmark searches run case-insensitive substring matches against the bookmark title using Prisma's `contains` filter configured with `mode: 'insensitive'`. Empty/whitespace searches are ignored.
*   **Pagination Math**: Keyset cursor-based pagination uses deterministic `createdAt DESC, id DESC` sorting, resolving identical timestamps by using the unique `id` field as a tie-breaker.
*   **Cursor Payload**: Opaque Base64 string representing `{ createdAt: Date, id: string }`.
*   **take + 1 strategy**: Fetches `take + 1` records. If size > take, `hasNextPage` evaluates to `true` and the last node is parsed to generate `nextCursor`. Otherwise, `hasNextPage` is `false` and `nextCursor` is `null`.

---

## 10. Validation and GraphQL Error Handling
Strict validation occurs in the service layer before Prisma operations:
*   Rejects whitespace/empty bookmark titles and folder names.
*   Rejects malformed URLs and non-HTTP/HTTPS protocols.
*   Rejects invalid `take` parameters (`<= 0` or `> 100`) and malformed base64/date cursors.
*   **Error Mappings**: Caught errors are converted to GraphQLErrors in the resolver layer:
    *   `BAD_USER_INPUT` (Validation exceptions)
    *   `NOT_FOUND` (Missing bookmark/folder IDs)

---

## 11. Testing Strategy
*   **Unit Tests**: Local resolver logic in `folder.test.ts` and `bookmark.test.ts` mock service implementations using a clean global delegate pattern to avoid ES module caching conflicts.
*   **PostgreSQL Integration Test**: `bookmarks-integration.test.ts` spins up a real connection to PostgreSQL in Docker, creates a folder, inserts bookmarks with identical timestamps, and executes paginated requests via `yoga.fetch()` to verify tie-breaker sorting.

---

## 12. Important Design Decisions
*   **Schema-First GraphQL**: Defining contracts in `.graphql` schema files keeps contract boundaries clear and structures resolver mappings.
*   **PostgreSQL Native `text[]` Tags**: Bookmark tags are mapped directly as native database string arrays, avoiding join tables and minimizing query overhead.
*   **Keyset/Cursor Pagination**: Eliminates offset performance degradation (`OFFSET N`) as the database scales, providing deterministic lookups using index coverage on `(createdAt, id)`.
*   **Prisma ORM**: Combines rapid schema modeling with automated type safety, keeping migrations and client models in sync.
*   **Service/Resolver Separation**: Service logic is pure TypeScript, completely isolated from routing protocols, making it reusable and easy to test.
*   **Explicit Validation**: Pre-flight database queries guard against Prisma database constraint violations, resolving cleanly to `BAD_USER_INPUT` and `NOT_FOUND` extensions.

---

## 13. Running Locally

Configure and launch the application locally using the following commands:

```bash
# 1. Start database container
docker compose up -d

# 2. Install dependencies
bun install

# 3. Deploy database schema migrations & generate client
bun run gendb

# 4. Start the GraphQL dev server
bun run dev
```

*   **GraphQL Yoga Playground**: [http://localhost:4000/graphql](http://localhost:4000/graphql)
*   **Sanity Verification Check**: `bun run sanity` (runs eslint, typecheck, and test suite).

---

## 14. Verification / Submission Readiness
The following validations have been completed successfully:
*   **Typecheck**: Strict-mode compiler check completed with **0 errors**.
*   **Linter**: ESLint check completed with **0 warnings/errors**.
*   **Test Suite**: All **33 tests** executed and passed successfully.
*   **GitHub Actions CI**: Validated syntax configuration locally using a PostgreSQL 16 service container.
