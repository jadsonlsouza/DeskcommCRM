import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

const state = vi.hoisted(() => ({ data: { current_version: "1.2.0", latest_version: "v1.3.0", is_owner: true, update_available: true } }));
vi.mock("@/hooks/system/useSystemVersion", () => ({ useSystemVersion: () => state }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (value: string) => value }));
import { VersionFooter } from "./VersionFooter";

afterEach(() => { cleanup(); state.data.update_available = true; state.data.is_owner = true; });
describe("installed version remains visible beside the update notice", () => {
  it("shows the reported installed version and the newer release separately", () => {
    render(<VersionFooter collapsed={false} />);
    expect(screen.getByText(/1\.2\.0/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /1\.3\.0/ })).toBeTruthy();
  });

  it("keeps the update panel reachable by the owner when there is no new release", () => {
    state.data.update_available = false;
    render(<VersionFooter collapsed={false} />);
    expect(screen.getByText(/1\.2\.0/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Atualização do sistema" })).toHaveAttribute(
      "href", "/app/settings/atualizacao",
    );
  });

  it("keeps the update panel hidden for other users", () => {
    state.data.is_owner = false;
    render(<VersionFooter collapsed={false} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
