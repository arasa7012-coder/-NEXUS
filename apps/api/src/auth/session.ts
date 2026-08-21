/**
 * Session lifecycle: login, refresh, revocation.
 *
 * Design:
 *   - Access tokens are short-lived (15 min) and stateless, so the common path
 *     costs one HMAC and no database round trip.
 *   - Refresh tokens are long-lived (30 days) and *stateful*, stored hashed.
 *     That combination is what makes logout actually mean something: revoking
 *     the session kills refresh immediately, and the access token expires on
 *     its own within 15 minutes.
 *   - Refresh tokens rotate on every use. A replayed refresh token indicates
 *     theft, and the correct response is to kill the whole session rather than
 *     to serve the request.
 */

import { createHash, randomBytes } from "node:crypto";
import type { JwtService } from "./jwt.ts";
import type { Clock } from "../platform/events.ts";

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionRecord {
  sid: string;
  userId: string;
  /** SHA-256 of the refresh token. The raw token is never stored. */
  refreshTokenHash: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  lastUsedAt: number;
}

export interface SessionRepository {
  create(session: SessionRecord): Promise<void>;
  findBySid(sid: string): Promise<SessionRecord | null>;
  update(session: SessionRecord): Promise<void>;
  revokeAllForUser(userId: string): Promise<number>;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  roles: string[];
  disabledAt: number | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

export type AuthFailure =
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_DISABLED"
  | "SESSION_NOT_FOUND"
  | "SESSION_REVOKED"
  | "SESSION_EXPIRED"
  | "REFRESH_REUSED";

export class AuthError extends Error {
  readonly reason: AuthFailure;
  constructor(reason: AuthFailure, message: string) {
    super(message);
    this.reason = reason;
    this.name = "AuthError";
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class SessionService {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  private readonly jwt: JwtService;
  private readonly clock: Clock;
  private readonly verify: (password: string, hash: string) => Promise<boolean>;

  constructor(deps: {
    users: UserRepository;
    sessions: SessionRepository;
    jwt: JwtService;
    clock: Clock;
    verifyPassword: (password: string, hash: string) => Promise<boolean>;
  }) {
    this.users = deps.users;
    this.sessions = deps.sessions;
    this.jwt = deps.jwt;
    this.clock = deps.clock;
    this.verify = deps.verifyPassword;
  }

  async login(email: string, password: string): Promise<{ tokens: TokenPair; user: UserRecord }> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());

    // Verify against a dummy hash when the user is absent, so that a missing
    // account and a wrong password take the same time. Otherwise response
    // timing enumerates valid email addresses.
    if (!user) {
      await this.verify(password, "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
      throw new AuthError("INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    const okPassword = await this.verify(password, user.passwordHash);
    if (!okPassword) throw new AuthError("INVALID_CREDENTIALS", "Email or password is incorrect.");
    if (user.disabledAt !== null) throw new AuthError("ACCOUNT_DISABLED", "This account is disabled.");

    return { tokens: await this.startSession(user), user };
  }

  private async startSession(user: UserRecord): Promise<TokenPair> {
    const now = this.clock.now();
    const sid = randomBytes(16).toString("hex");
    const refreshToken = randomBytes(32).toString("base64url");

    await this.sessions.create({
      sid,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      createdAt: now,
      expiresAt: now + REFRESH_TTL_MS,
      revokedAt: null,
      lastUsedAt: now,
    });

    return {
      accessToken: this.jwt.issue({ sub: user.id, sid, roles: user.roles }, now, ACCESS_TTL_SEC),
      refreshToken,
      expiresInSec: ACCESS_TTL_SEC,
    };
  }

  async refresh(sid: string, refreshToken: string): Promise<TokenPair> {
    const session = await this.sessions.findBySid(sid);
    if (!session) throw new AuthError("SESSION_NOT_FOUND", "Session not found.");

    const now = this.clock.now();
    if (session.revokedAt !== null) throw new AuthError("SESSION_REVOKED", "Session has been revoked.");
    if (now > session.expiresAt) throw new AuthError("SESSION_EXPIRED", "Session has expired.");

    if (hashToken(refreshToken) !== session.refreshTokenHash) {
      // The presented token is stale or forged. Either way the session is
      // compromised: revoke it rather than merely rejecting this request.
      await this.sessions.update({ ...session, revokedAt: now });
      throw new AuthError("REFRESH_REUSED", "Refresh token was already used or is invalid; session revoked.");
    }

    const user = await this.users.findById(session.userId);
    if (!user || user.disabledAt !== null) {
      await this.sessions.update({ ...session, revokedAt: now });
      throw new AuthError("ACCOUNT_DISABLED", "This account is disabled.");
    }

    // Rotate.
    const nextRefresh = randomBytes(32).toString("base64url");
    await this.sessions.update({
      ...session,
      refreshTokenHash: hashToken(nextRefresh),
      lastUsedAt: now,
    });

    return {
      accessToken: this.jwt.issue({ sub: user.id, sid, roles: user.roles }, now, ACCESS_TTL_SEC),
      refreshToken: nextRefresh,
      expiresInSec: ACCESS_TTL_SEC,
    };
  }

  async logout(sid: string): Promise<void> {
    const session = await this.sessions.findBySid(sid);
    if (!session || session.revokedAt !== null) return;
    await this.sessions.update({ ...session, revokedAt: this.clock.now() });
  }

  async logoutAll(userId: string): Promise<number> {
    return this.sessions.revokeAllForUser(userId);
  }

  /** Verifies an access token AND that its session is still live. */
  async authenticate(accessToken: string): Promise<{ userId: string; sid: string; roles: string[] }> {
    const claims = this.jwt.verify(accessToken, this.clock.now());
    const session = await this.sessions.findBySid(claims.sid);
    if (!session) throw new AuthError("SESSION_NOT_FOUND", "Session no longer exists.");
    if (session.revokedAt !== null) throw new AuthError("SESSION_REVOKED", "Session has been revoked.");
    return { userId: claims.sub, sid: claims.sid, roles: claims.roles ?? [] };
  }
}
