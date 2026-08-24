# Bookmark Manager GraphQL API

A robust, production-grade schema-first GraphQL API for managing folder structures and cursor-paginated bookmarks. This application is built with modern tools to deliver deterministic performance, strict input validation, and clean architectural separation.

---

## Tech Stack

*   **Runtime**: [Bun](https://bun.sh/) (Fast all-in-one JS/TS bundler and test runner)
*   **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict-mode compiler)
*   **GraphQL Server**: [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server)
*   **Database ORM**: [Prisma](https://www.prisma.io/)
*   **Database**: [PostgreSQL](https://www.postgresql.org/)
*   **Containerization**: [Docker Compose](https://docs.docker.com/compose/)

---

## Prerequisites

Ensure you have the following software installed locally:
*   **Bun** (v1.0.0 or higher)
*   **Docker Desktop** (or Docker Engine with Docker Compose)
*   **Git**

---

## Setup

Follow these steps to set up a fresh local clone:

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/LuciferAditya28/bookmark-manager-graphql.git
    cd bookmark-manager-graphql
    ```

2.  **Start the Database**:
    Launch the PostgreSQL container in detached mode:
    ```bash
    docker compose up -d
    ```

3.  **Configure Environment Variables**:
    Copy the sample configuration file to create your active `.env` file:
    ```bash
    cp .env.example .env
    ```

4.  **Install Dependencies**:
    ```bash
    bun install
    ```

5.  **Prepare the Database Schema**:
    Run the unified database generation helper:
    ```bash
    bun run gendb
    ```
    > [!NOTE]  
    > The `gendb` script is configured to:
    > 1. Apply committed Prisma migrations to the database using `prisma migrate deploy`.
    > 2. Generate the local typed Prisma Client using `prisma generate`.
    > 
    > During active development, if you modify the schema and want to create a new migration, use:
    > `bun run prisma:migrate --name <migration-name>`

6.  **Start the Development Server**:
    ```bash
    bun run dev
    ```

---

## Environment Variables

The project uses the following environment variables defined in `.env`:

*   `DATABASE_URL`: Connection string for PostgreSQL (Default: `postgresql://postgres:postgres@localhost:5432/bookmark_manager?schema=public`).
*   `PORT`: Port number on which the GraphQL Yoga server listens (Default: `4000`).

---

## Database

*   **Database Container**: Handled via `docker-compose.yml` pulling a lightweight Alpine PostgreSQL 16 image.
*   **ORM Schema**: Located at [`prisma/schema.prisma`](file:///c:/Users/MANISH%20KUMAR/OneDrive/Desktop/bookmark-manager-burdenoff/prisma/schema.prisma).
*   **Migrations**:
    *   To apply existing migrations (clean setup): `bun run gendb`.
    *   To create a new migration in development: `bun run prisma:migrate`.
    *   To view data visually: `bun run prisma:studio`.

---

## Running the Application

After running `bun run dev`, the server starts in watch mode.
*   **GraphQL API Playground**: [http://localhost:4000/graphql](http://localhost:4000/graphql)

---

## GraphQL API

### Queries

*   `folders: [Folder!]!`: Returns a list of all folders sorted deterministically by `createdAt ASC, id ASC`.
*   `folder(id: ID!): Folder`: Fetches a single folder by ID (returns `null` if not found). Supports nesting folder bookmarks.
*   `bookmarks(folderId: ID, search: String, take: Int, cursor: String): BookmarkConnection!`: Fetches a page of bookmarks using cursor pagination and optional search/folder filters.

### Mutations

*   `createFolder(name: String!): Folder!`: Creates a folder.
*   `createBookmark(input: CreateBookmarkInput!): Bookmark!`: Creates a bookmark.
*   `updateBookmark(id: ID!, input: UpdateBookmarkInput!): Bookmark!`: Updates bookmark title, URL, or tags.
*   `deleteBookmark(id: ID!): Bookmark!`: Deletes a bookmark.
*   `moveBookmark(id: ID!, folderId: ID!): Bookmark!`: Moves a bookmark to another folder.

### Core GraphQL Examples

#### Create Folder and Create Bookmark
```graphql
mutation SetupData {
  createFolder(name: "Tech Resources") {
    id
  }
}

mutation AddBookmark {
  createBookmark(input: {
    title: "GraphQL Yoga Docs"
    url: "https://the-guild.dev/graphql/yoga-server"
    folderId: "insert-folder-uuid-here"
    tags: ["graphql", "yoga", "docs"]
  }) {
    id
    title
    url
    folder {
      name
    }
  }
}
```

#### Fetch Folder with Bookmarks
```graphql
query GetFolderWithBookmarks {
  folder(id: "insert-folder-uuid-here") {
    id
    name
    bookmarks {
      id
      title
      url
    }
  }
}
```

#### Update, Move, and Delete Bookmark
```graphql
mutation ModifyBookmark {
  updateBookmark(id: "bookmark-uuid", input: {
    title: "Yoga Docs Updated"
  }) {
    id
    title
  }

  moveBookmark(id: "bookmark-uuid", folderId: "other-folder-uuid") {
    id
    folderId
  }

  deleteBookmark(id: "bookmark-uuid") {
    id
  }
}
```

---

## Search

*   Bookmark search is triggered by passing the `search` string argument to the `bookmarks` query.
*   It performs a **case-insensitive substring match** against the bookmark `title` using PostgreSQL's native `ILIKE` equivalent under Prisma Client (`mode: 'insensitive'`).
*   Empty or whitespace-only search queries are automatically ignored, acting as if no search filter was provided.

---

## Cursor Pagination

The application implements a strict **keyset cursor pagination** strategy:

1.  **Deterministic Ordering**: Sorted by `createdAt DESC, id DESC` to avoid paginating issues with identical timestamps.
2.  **Opaque Base64 Cursor**: Represents a JSON object containing `{ createdAt: Date, id: string }` encoded to Base64.
3.  **Forward Keyset Math**: Filters for entries succeeding the cursor bounds:
    `createdAt < cursorDate OR (createdAt == cursorDate AND id < cursorId)`
4.  **Buffer Record Strategy**: Queries `take + 1` records. If the count exceeds `take`, `hasNextPage` evaluates to `true` and the last node is parsed to generate `nextCursor`. Otherwise, `hasNextPage` is `false` and `nextCursor` is `null`.

#### Cursor Pagination Traversal Example:
```graphql
# First Request (take: 2, no cursor)
query FetchPage1 {
  bookmarks(take: 2) {
    nodes {
      id
      title
    }
    nextCursor
    hasNextPage
  }
}

# Response contains:
# "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTI0VDEyOjIyOjE2LjQ2MloiLCJpZCI6IjFhZDM0OTVmLTM1YmEtNGRiMC04OWJhLWM4MmQ1OWQ2MWQ0ZiJ9"
# "hasNextPage": true

# Second Request (pass the nextCursor)
query FetchPage2 {
  bookmarks(
    take: 2
    cursor: "eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTI0VDEyOjIyOjE2LjQ2MloiLCJpZCI6IjFhZDM0OTVmLTM1YmEtNGRiMC04OWJhLWM4MmQ1OWQ2MWQ0ZiJ9"
  ) {
    nodes {
      id
      title
    }
    nextCursor
    hasNextPage
  }
}
```

---

## Validation and Errors

Explicit validations are completed in the service layer before executing database operations:

*   **Validation Errors (`BAD_USER_INPUT`)**:
    *   Folder names cannot be empty or whitespace-only.
    *   Bookmark titles cannot be empty or whitespace-only.
    *   Bookmark URLs must be well-formed using the standard standard `URL` constructor and restrict protocols strictly to HTTP and HTTPS.
    *   Cursors must be valid JSON payloads containing a valid ISO Date representation and non-empty `id`.
    *   The `take` query parameter must satisfy `take > 0` and `take <= 100`.
*   **Not Found Errors (`NOT_FOUND`)**:
    *   Operating on missing folder IDs or missing bookmark IDs.
    *   Associating a bookmark to a non-existent parent folder.

Raw database constraint violations are not leaked. All errors are caught and converted to custom GraphQL Yoga formatted errors with explicit extension codes.

---

## Testing

Run tests and compiler checks with the following scripts:

*   `bun test`: Runs the test suite containing:
    *   **Unit Tests**: Local resolver logic tested by mocking service layers via the global test delegate pattern.
    *   **Integration Tests**: Real database query loops traversing multiple cursor pages and validating tie-breaker sort orders directly against PostgreSQL.
*   `bun run typecheck`: Runs strict TypeScript compilation checking.
*   `bun run lint`: Runs ESLint checking formatting constraints.

---

## Project Structure

```
├── .github/                   # CI/CD Workflows
├── prisma/                    # Database configurations
│   ├── schema.prisma          # Prisma schema definition
│   └── migrations/            # SQL migration history
├── src/
│   ├── db/
│   │   └── client.ts          # Configured Prisma Client singleton
│   ├── resolvers/
│   │   ├── index.ts           # GraphQL resolvers definition
│   │   ├── bookmark.test.ts   # Bookmark resolvers unit tests
│   │   ├── folder.test.ts     # Folder resolvers unit tests
│   │   └── bookmarks-integration.test.ts # PostgreSQL Integration tests
│   ├── schema/
│   │   ├── schema.graphql     # Schema-first GraphQL contract
│   │   └── typeDefs.ts        # Dynamic type definitions loader
│   ├── services/
│   │   ├── bookmark.service.ts # Bookmark database operations
│   │   └── folder.service.ts   # Folder database operations
│   ├── validation/
│   │   └── index.ts           # Strict validation logic & cursor helpers
│   └── index.ts               # Yoga Application Entrypoint
```

---

## How I'd Extend This

In a production scenario, this application could scale by implementing:
1.  **Authentication & Authorization**: Adding JWT validation middleware inside Yoga context and field-level permissions (e.g. users owning folders/bookmarks).
2.  **Caching**: Introducing a Redis caching layer for hot folders and the `folders` query to reduce database reads.
3.  **Advanced Search**: Utilizing PostgreSQL's `pg_trgm` fuzzy matching or full-text indexing, or integrating search services like Elasticsearch for complex search syntax.
4.  **Observability**: Adding OpenTelemetry middleware to export API traces, resolver metrics, and slow Prisma database query logs.
5.  **API Versioning**: Utilizing path or header-based routing to support schema versioning as client requirements change.
6.  **Database Scaling**: Setting up replica reader databases for read-only query paths (like list querying) and primary writers for mutations.

---

## Design Decisions / Tradeoffs

*   **Schema-First GraphQL**: Explicitly defines the API contracts in dynamic `.graphql` files. This keeps frontend/backend developers aligned on shape and enforces type generation.
*   **Prisma ORM**: Combines SQL migrations with automated type safety. A minor trade-off is the slight query overhead compared to raw driver queries, but it provides high developer velocity and safety.
*   **UUID Identifiers**: Enforces globally unique UUIDv4 tokens. Prevents enumeration attacks and simplifies offline/client-side creation.
*   **String[] Array Mapping for Tags**: Leverages PostgreSQL's native array column type for simple bookmark tag lists. Avoids complex join table queries for basic structures.
*   **Composite Indexing**: Defined `[createdAt, id]` indexes explicitly in Prisma schema to optimize keyset cursor boundary checks.
*   **Global Test Delegate Pattern**: Replaces global ES module mock tools in test suites. Solves process-wide module caching pollution cleanly without relying on brittle runtime interceptors.
