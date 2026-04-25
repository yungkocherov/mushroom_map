/**
 * Auth-типы. Зеркалят `/api/user/me` и `/api/auth/refresh` из FastAPI
 * (см. services/api/src/api/routes/auth.py и user.py).
 */

export interface AuthUser {
  id: string;
  auth_provider: string;
  email: string | null;
  email_verified: boolean;
  display_name: string | null;
  avatar_url: string | null;
  locale: string | null;
  status: "active" | "banned" | "deleted";
  created_at: string;
  last_login_at: string | null;
}

export interface AuthRefreshResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
}
