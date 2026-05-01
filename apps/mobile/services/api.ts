import * as SecureStore from "expo-secure-store";

const DEFAULT_BASE_URL = "https://api.geobiom.ru";
const TOKEN_KEY = "geobiom.device_token.v1";

let baseUrl = DEFAULT_BASE_URL;

export function setApiBaseUrl(url: string): void {
  baseUrl = url.replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  return baseUrl;
}

export async function getDeviceToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setDeviceToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function clearDeviceToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOpts = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function apiRequest<T>(
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const { method = "GET", body, auth = true, signal, timeoutMs = 15000 } = opts;
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const token = await getDeviceToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(
      typeof parsed === "object" && parsed && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : `HTTP ${res.status} on ${path}`,
      res.status,
      parsed,
    );
  }

  return parsed as T;
}
