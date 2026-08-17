import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  api: {
    me: jest.fn(),
    login: jest.fn(),
  },
}));

function TestConsumer() {
  const { token, user, loading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="token">{token ?? "none"}</span>
      <span data-testid="user">{user?.email ?? "none"}</span>
      <button onClick={() => login("citizen@example.com", "Passw0rd123")}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it("starts with loading=false and no user when localStorage has no token", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("token").textContent).toBe("none");
  });

  it("restores a session from localStorage on mount by calling /auth/me with the stored token", async () => {
    localStorage.setItem("ecotrack_token", "stored-token-abc");
    (api.me as jest.Mock).mockResolvedValueOnce({ id: "1", email: "restored@example.com", role: "CITIZEN" });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("restored@example.com"));
    expect(api.me).toHaveBeenCalledWith("stored-token-abc");
  });

  it("clears an invalid stored token instead of leaving the app in a broken logged-in-looking state", async () => {
    localStorage.setItem("ecotrack_token", "expired-token");
    (api.me as jest.Mock).mockRejectedValueOnce(new Error("401"));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("token").textContent).toBe("none");
    expect(localStorage.getItem("ecotrack_token")).toBeNull();
  });

  it("login() stores real tokens and fetches the real user profile", async () => {
    (api.login as jest.Mock).mockResolvedValueOnce({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      token_type: "bearer",
    });
    (api.me as jest.Mock).mockResolvedValueOnce({ id: "2", email: "citizen@example.com", role: "CITIZEN" });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    await userEvent.click(screen.getByText("Login"));

    await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("new-access-token"));
    expect(screen.getByTestId("user").textContent).toBe("citizen@example.com");
    expect(localStorage.getItem("ecotrack_token")).toBe("new-access-token");
    expect(localStorage.getItem("ecotrack_refresh_token")).toBe("new-refresh-token");
  });

  it("logout() clears both tokens from localStorage and resets state", async () => {
    localStorage.setItem("ecotrack_token", "stored-token-abc");
    (api.me as jest.Mock).mockResolvedValueOnce({ id: "1", email: "restored@example.com", role: "CITIZEN" });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("restored@example.com"));

    await userEvent.click(screen.getByText("Logout"));

    await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("none"));
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(localStorage.getItem("ecotrack_token")).toBeNull();
  });

  it("useAuth throws a clear error when used outside AuthProvider, rather than silently returning undefined", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow("useAuth must be used within AuthProvider");
    consoleError.mockRestore();
  });
});
