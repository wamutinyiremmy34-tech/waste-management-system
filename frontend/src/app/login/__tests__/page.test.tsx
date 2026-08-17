import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/login/page";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";

jest.mock("@/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders email and password fields and the sign-in button", () => {
    (useAuth as jest.Mock).mockReturnValue({ login: jest.fn() });
    render(<LoginPage />);

    expect(document.querySelector('input[type="email"]')).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("calls the real login() function with the entered email and password on submit", async () => {
    const loginMock = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({ login: loginMock });
    render(<LoginPage />);

    await userEvent.type(document.querySelector('input[type="email"]')!, "citizen@example.com");
    await userEvent.type(document.querySelector('input[type="password"]')!, "Passw0rd123");
    await userEvent.click(screen.getByText("Sign in"));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith("citizen@example.com", "Passw0rd123"));
  });

  it("navigates to /post-login after a successful login", async () => {
    const loginMock = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({ login: loginMock });
    render(<LoginPage />);

    await userEvent.type(document.querySelector('input[type="email"]')!, "citizen@example.com");
    await userEvent.type(document.querySelector('input[type="password"]')!, "Passw0rd123");
    await userEvent.click(screen.getByText("Sign in"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/post-login"));
  });

  it("displays the real server error message when login fails, and does NOT navigate", async () => {
    const loginMock = jest.fn().mockRejectedValue(new ApiError(401, "Invalid email or password"));
    (useAuth as jest.Mock).mockReturnValue({ login: loginMock });
    render(<LoginPage />);

    await userEvent.type(document.querySelector('input[type="email"]')!, "citizen@example.com");
    await userEvent.type(document.querySelector('input[type="password"]')!, "wrongpassword");
    await userEvent.click(screen.getByText("Sign in"));

    await waitFor(() => expect(screen.getByText("Invalid email or password")).toBeInTheDocument());
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows a generic fallback message for a non-API error (e.g. a network failure)", async () => {
    const loginMock = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    (useAuth as jest.Mock).mockReturnValue({ login: loginMock });
    render(<LoginPage />);

    await userEvent.type(document.querySelector('input[type="email"]')!, "citizen@example.com");
    await userEvent.type(document.querySelector('input[type="password"]')!, "Passw0rd123");
    await userEvent.click(screen.getByText("Sign in"));

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
  });

  it("disables the submit button while a login is in progress", async () => {
    let resolveLogin: () => void = () => {};
    const loginMock = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        })
    );
    (useAuth as jest.Mock).mockReturnValue({ login: loginMock });
    render(<LoginPage />);

    await userEvent.type(document.querySelector('input[type="email"]')!, "citizen@example.com");
    await userEvent.type(document.querySelector('input[type="password"]')!, "Passw0rd123");
    await userEvent.click(screen.getByText("Sign in"));

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();

    resolveLogin();
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });
});
