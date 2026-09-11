import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionStatus } from "@/components/connection-status";

describe("ConnectionStatus", () => {
	it.each([
		["loading", "Checking API connection…"],
		["connected", "API connected"],
		["disconnected", "API disconnected"],
	] as const)("renders the %s state", (status, copy) => {
		render(<ConnectionStatus status={status} />);
		expect(screen.getByRole("status")).toHaveTextContent(copy);
	});
});
