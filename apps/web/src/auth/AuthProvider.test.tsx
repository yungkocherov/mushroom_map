import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { useContext } from "react";

import { AuthContext, AuthProvider } from "./AuthProvider";

// Мокаем сетевые функции api-client'а: AuthProvider — единственный
// потребитель authRefresh/fetchMe/authLogout. Возвращаемые значения
// перезаписываем per-test.
const mocks = vi.hoisted(() => ({
  authRefresh: vi.fn(),
  fetchMe: vi.fn(),
  authLogout: vi.fn(),
  authYandexLoginUrl: vi.fn(() => "/api/auth/yandex/login"),
}));

vi.mock("@mushroom-map/api-client", () => mocks);

function StatusProbe() {
  const ctx = useContext(AuthContext);
  return (
    <>
      <div data-testid="status">{ctx?.status}</div>
      <div data-testid="user">{ctx?.user?.id ?? ""}</div>
      <button onClick={() => void ctx?.logout()} data-testid="logout">
        logout
      </button>
    </>
  );
}

beforeEach(() => {
  mocks.authRefresh.mockReset();
  mocks.fetchMe.mockReset();
  mocks.authLogout.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AuthProvider — hydrate flows", () => {
  it("authRefresh→null (401) puts status=unauth without retry", async () => {
    mocks.authRefresh.mockResolvedValue(null);
    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("unauth"),
    );
    expect(mocks.authRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMe).not.toHaveBeenCalled();
  });

  it("authRefresh→token + fetchMe→user puts status=authenticated", async () => {
    mocks.authRefresh.mockResolvedValue({
      access_token: "tok",
      expires_in: 900,
    });
    mocks.fetchMe.mockResolvedValue({ id: "user-42", email: "x@y" });
    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("authenticated"),
    );
    expect(screen.getByTestId("user").textContent).toBe("user-42");
  });

  it("network error → status остаётся 'loading' (retry-with-backoff активен)", async () => {
    // PR-W3 поведение: на сетевую ошибку hydrate ставит retry-таймер
    // и НЕ переходит в unauth с первого blip'а. Status держится в
    // loading до исчерпания backoff'а (1s/5s/30s) или успешного refresh'а.
    mocks.authRefresh.mockRejectedValue(new Error("network"));
    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );
    // Дать react flush + rejected promise обработаться.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("status").textContent).toBe("loading");
    expect(mocks.authRefresh).toHaveBeenCalledTimes(1);
  });

  it("logout вызывает authLogout и сбрасывает status в unauth", async () => {
    mocks.authRefresh.mockResolvedValue({
      access_token: "tok",
      expires_in: 900,
    });
    mocks.fetchMe.mockResolvedValue({ id: "user-1", email: "x@y" });
    mocks.authLogout.mockResolvedValue(undefined);
    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("authenticated"),
    );

    await act(async () => {
      screen.getByTestId("logout").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe("unauth"),
    );
    expect(mocks.authLogout).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("user").textContent).toBe("");
  });

  // Эти сценарии становятся возможны после PR-W3 (generation-counter +
  // retry-with-backoff). Оставлены как .todo чтобы не забыть тестировать
  // новое поведение после merge'а.
  it.todo(
    "logout до завершения in-flight refresh не выставляет authenticated (после PR-W3)",
  );
  it.todo(
    "network error → backoff retry 1s/5s/30s, status остаётся loading (после PR-W3)",
  );
});
