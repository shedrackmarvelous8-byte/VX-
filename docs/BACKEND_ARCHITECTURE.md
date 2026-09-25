# VX Backend Architecture & Security Guide

## 1. Overview
The VX backend provides a secure, production-grade foundation for authentication, user profiles, and project management.

## 2. API Endpoints

### Health & Diagnostics
- `GET /api/health`: Returns API and database status.

### Authentication
- `POST /api/auth/signup`: Registers a new user with email, password, and optional display name. Sets an `httpOnly` secure session cookie and returns `{ user, session }`.
- `POST /api/auth/login`: Authenticates existing credentials against bcrypt hashes, creates an active session, and sets cookie.
- `POST /api/auth/logout`: Invalidates the session on the server and clears the session cookie.
- `GET /api/auth/me`: Retrieves current authenticated user profile using cookie or Bearer token header. Returns 401 if unauthenticated.
- `POST /api/auth/reset-password/request`: Initiates a password reset request and creates an expiring reset token.
- `POST /api/auth/reset-password/confirm`: Verifies the token and updates the user's password hash.

### User Profiles
- `GET /api/users/profile`: Retrieves current user profile.
- `PATCH /api/users/profile`: Updates `display_name` or `avatar_url` for the authenticated user.

### Projects
- `GET /api/projects`: Lists all projects owned by the authenticated user.
- `POST /api/projects`: Creates a new project with user ownership.
- `GET /api/projects/:id`: Retrieves a project with strict ownership verification. Returns 404/403 for unauthorized access.
- `PATCH /api/projects/:id`: Updates a project's name or metadata with strict ownership verification.
- `DELETE /api/projects/:id`: Deletes a project owned by the user.

## 3. Security & Anti-IDOR Protections
1. **Server-Side Authorization**: Every project endpoint verifies `project.user_id === authenticatedUser.id`.
2. **Password Security**: Passwords are never stored in plaintext. They are hashed using bcrypt with salt.
3. **Session Hardening**: Sessions use cryptographically random 256-bit keys and `httpOnly`, `SameSite=Lax` cookies.
4. **Input Validation**: All payloads are validated for email format, password complexity, and string bounds.
5. **No Secret Leaks**: Secrets like `SUPABASE_SECRET_KEY` and database passwords never leave the server.
