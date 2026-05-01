import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import {
  apiRequest,
  setDeviceToken,
  clearDeviceToken,
  getDeviceToken,
} from "./api";

WebBrowser.maybeCompleteAuthSession();

const DEVICE_ID_KEY = "geobiom.device_id.v1";
const YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
const YANDEX_DISCOVERY = {
  authorizationEndpoint: YANDEX_AUTHORIZE_URL,
};

export type AuthResult =
  | { kind: "ok"; userEmail: string | null }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

/**
 * Yandex OAuth via Authorization Code + PKCE.
 *
 * Phase 1: requires `YANDEX_MOBILE_CLIENT_ID` from
 * https://oauth.yandex.ru/ — populate via app config / env. Backend
 * endpoint `/api/mobile/auth/yandex` exchanges code (with backend's
 * client_secret) for our device_token. App never sees client_secret.
 */
export async function loginWithYandex(
  clientId: string,
): Promise<AuthResult> {
  if (!clientId) {
    return { kind: "error", message: "MOBILE_CLIENT_ID is empty" };
  }

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "geobiom",
    path: "auth/callback",
  });

  const codeVerifierBytes = await Crypto.getRandomBytesAsync(32);
  const codeVerifier = base64UrlEncode(codeVerifierBytes);
  const codeChallenge = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  const challengeUrlSafe = codeChallenge
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const stateBytes = await Crypto.getRandomBytesAsync(16);
  const state = base64UrlEncode(stateBytes);

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ["login:email", "login:info", "login:avatar"],
    responseType: AuthSession.ResponseType.Code,
    codeChallenge: challengeUrlSafe,
    codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
    state,
    usePKCE: true,
  });
  await request.makeAuthUrlAsync(YANDEX_DISCOVERY);
  const result = await request.promptAsync(YANDEX_DISCOVERY);

  if (result.type === "cancel" || result.type === "dismiss") {
    return { kind: "cancelled" };
  }
  if (result.type !== "success") {
    return { kind: "error", message: `auth flow returned ${result.type}` };
  }
  if (result.params.state !== state) {
    return { kind: "error", message: "state mismatch — possible CSRF" };
  }
  const code = result.params.code;
  if (!code) {
    return { kind: "error", message: "no code in callback" };
  }

  const deviceId = await getOrCreateDeviceId();
  try {
    const exchanged = await apiRequest<{
      device_token: string;
      user: { email: string | null; name: string | null };
    }>("/api/mobile/auth/yandex", {
      method: "POST",
      auth: false,
      body: {
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        device_id: deviceId,
      },
    });
    await setDeviceToken(exchanged.device_token);
    return { kind: "ok", userEmail: exchanged.user.email };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "exchange failed",
    };
  }
}

export async function logout(): Promise<void> {
  try {
    await apiRequest("/api/mobile/auth/revoke", { method: "POST" });
  } catch {
    /* swallow — local logout always succeeds */
  }
  await clearDeviceToken();
}

export async function isLoggedIn(): Promise<boolean> {
  const t = await getDeviceToken();
  return !!t;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
