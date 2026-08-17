import { api, ApiError } from "@/lib/api";

describe("api client", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("sends the Bearer token header when a token is provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "1", email: "a@example.com" }),
    });

    await api.me("real-token-123");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/me"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer real-token-123" }),
      })
    );
  });

  it("does not send an Authorization header when no token is given", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "x", refresh_token: "y", token_type: "bearer" }),
    });

    await api.login("a@example.com", "Passw0rd123");

    const callHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(callHeaders.Authorization).toBeUndefined();
  });

  it("throws a real ApiError with the server-provided status and message on a 4xx response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: "Conflict",
      json: async () => ({ detail: "Email already registered" }),
    });

    await expect(
      api.register({ email: "dup@example.com", password: "Passw0rd123", full_name: "Dup User", role: "CITIZEN" })
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining("Email already registered") });
  });

  it("wraps rejections in ApiError, not a raw generic error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ detail: "Invalid email or password" }),
    });

    try {
      await api.login("a@example.com", "wrong");
      fail("expected api.login to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
    }
  });

  it("falls back to statusText when the error body has no detail field (e.g. a non-JSON response)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(api.me("token")).rejects.toMatchObject({ status: 500, message: "Internal Server Error" });
  });

  it("sends real pickup request fields, including optional fields only when provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: "p1" }),
    });

    await api.requestPickup("tok", { waste_category: "PLASTIC", latitude: 0.34, longitude: 32.58 });

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toEqual({ waste_category: "PLASTIC", latitude: 0.34, longitude: 32.58 });
    expect(body.address_text).toBeUndefined();
  });
});
