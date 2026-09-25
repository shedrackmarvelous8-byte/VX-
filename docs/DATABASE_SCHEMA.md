# VX Database Schema & Migration Foundation

This document defines the relational database architecture for VX.

## Overview
The VX database foundation is built using PostgreSQL (Supabase). It enforces strict user data isolation, Row Level Security (RLS), foreign key constraints with cascading deletes, and optimized indexes.

## Entity Relationship Summary

```text
+-----------------------+          +------------------------+
|       PROFILES        | <----+-- |    AUTH_CREDENTIALS    |
|-----------------------|      |   |------------------------|
| id (UUID, PK)         |      |   | user_id (UUID, PK, FK) |
| email (TEXT, UNIQUE)  |      |   | password_hash (TEXT)   |
| display_name (TEXT)   |      |   | created_at (TIMESTAMPTZ|
| avatar_url (TEXT)     |      |   | updated_at (TIMESTAMPTZ|
| created_at (TIMESTAMPTZ      |   +------------------------+
| updated_at (TIMESTAMPTZ      |
+-----------------------+      |   +------------------------+
        |                      +-- |     AUTH_SESSIONS      |
        | 1:N                  |   |------------------------|
        |                      |   | token (TEXT, PK)       |
        v                      |   | user_id (UUID, FK)     |
+-----------------------+      |   | expires_at (TIMESTAMPTZ|
|       PROJECTS        |      |   | created_at (TIMESTAMPTZ|
|-----------------------|      |   +------------------------+
| id (UUID, PK)         |      |
| user_id (UUID, FK)    |      |   +------------------------+
| name (TEXT)           |      +-- |   AUTH_RESET_TOKENS    |
| description (TEXT)    |          |------------------------|
| stack (TEXT)          |          | token (TEXT, PK)       |
| created_at (TIMESTAMPTZ          | user_id (UUID, FK)     |
| updated_at (TIMESTAMPTZ          | expires_at (TIMESTAMPTZ|
+-----------------------+          | created_at (TIMESTAMPTZ|
                                   +------------------------+
```

## Tables

### 1. `profiles`
Represents the authenticated user in VX.
- `id`: UUID (Primary Key)
- `email`: TEXT (Unique, Indexed, Case-insensitive match)
- `display_name`: TEXT (Nullable, User's readable name)
- `avatar_url`: TEXT (Nullable, URL / key to avatar)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### 2. `auth_credentials`
Stores securely salted and hashed passwords (bcrypt, work factor $\ge 10$).
- `user_id`: UUID (Primary Key, Foreign Key -> `profiles.id` ON DELETE CASCADE)
- `password_hash`: TEXT (Bcrypt hashed password)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### 3. `auth_sessions`
Active session tokens with automatic TTL/expiration.
- `token`: TEXT (Primary Key, 256-bit cryptographically secure token)
- `user_id`: UUID (Foreign Key -> `profiles.id` ON DELETE CASCADE)
- `expires_at`: TIMESTAMPTZ (Session lifetime, e.g., 30 days)
- `created_at`: TIMESTAMPTZ

### 4. `auth_reset_tokens`
Tokens for password reset requests with 1-hour expiration.
- `token`: TEXT (Primary Key, secure random string)
- `user_id`: UUID (Foreign Key -> `profiles.id` ON DELETE CASCADE)
- `expires_at`: TIMESTAMPTZ (1 hour)
- `created_at`: TIMESTAMPTZ

### 5. `projects`
Workspaces and repositories created by users.
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key -> `profiles.id` ON DELETE CASCADE)
- `name`: TEXT (Project name)
- `description`: TEXT (Optional brief description)
- `stack`: TEXT (e.g., 'Next.js', 'React · Node', 'Go · Postgres')
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

## Extensibility for Later Prompts
The schema is designed to attach future tables without migration conflicts:
- `conversations` (user_id, project_id, title, pinned, archived)
- `messages` (conversation_id, role, content, kind, plan, activity, attachments)
- `project_files` (project_id, path, content_hash, storage_key)
- `deployments` (project_id, provider, status, url)
- `environment_variables` (project_id, key, encrypted_value)
