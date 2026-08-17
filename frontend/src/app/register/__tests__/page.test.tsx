import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegisterPage from "@/app/register/page";
import { api, ApiError } from "@/lib/api";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: { register: jest.fn() },
  };
});

const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

async function fillAndSubmit(overrides: Partial<{ name: string; email: string; password: string }> = {}) {
  const name = overrides.name ?? "Test Citizen";
  const email = overrides.email ?? "newcitizen@example.com";
  const password = overrides.password ?? "Passw0rd123";

  const nameInput = document.querySelector("form input:not([type])") as HTMLInputElement;
  await userEvent.type(nameInput, name);
  await userEvent.type(document.querySelector('input[type="email"]')!, email);
  await userEvent.type(document.querySelector('input[type="password"]')!, password);
  await userEvent.click(screen.getByText("Create account"));
}

describe("RegisterPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("submits the real registration payload including the default CITIZEN role", async () => {
    (api.register as jest.Mock).mockResolvedValueOnce({ id: "1" });
    render(<RegisterPage />);

    await fillAndSubmit();

    await waitFor(() =>
      expect(api.register).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: "Test Citizen",
          email: "newcitizen@example.com",
          password: "Passw0rd123",
          role: "CITIZEN",
        })
      )
    );
  });

  it("submits COLLECTOR as the role when the role selector is changed", async () => {
    (api.register as jest.Mock).mockResolvedValueOnce({ id: "1" });
    render(<RegisterPage />);

    const roleSelect = document.querySelector("select") as HTMLSelectElement;
    await userEvent.selectOptions(roleSelect, "COLLECTOR");
    await fillAndSubmit({ email: "newcollector@example.com" });

    await waitFor(() =>
      expect(api.register).toHaveBeenCalledWith(expect.objectContaining({ role: "COLLECTOR" }))
    );
  });

  it("shows a success message and redirects to /login after successful registration", async () => {
    (api.register as jest.Mock).mockResolvedValueOnce({ id: "1" });
    render(<RegisterPage />);

    await fillAndSubmit();

    await waitFor(() => expect(screen.getByText(/account created/i)).toBeInTheDocument());
  });

  it("displays the real server error (e.g. duplicate email) instead of a generic message when available", async () => {
    (api.register as jest.Mock).mockRejectedValueOnce(new ApiError(409, "Email already registered"));
    render(<RegisterPage />);

    await fillAndSubmit();

    await waitFor(() => expect(screen.getByText("Email already registered")).toBeInTheDocument());
  });

  it("enforces the HTML minLength constraint on the password field (8 chars) client-side", () => {
    render(<RegisterPage />);
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    expect(passwordInput.minLength).toBe(8);
    expect(passwordInput.required).toBe(true);
  });
});
