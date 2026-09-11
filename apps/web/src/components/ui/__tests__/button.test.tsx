import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("shadcn Button primitive", () => {
	it("applies the selected variant and forwards disabled state", () => {
		render(
			<Button disabled variant="secondary">
				再評価
			</Button>
		);

		const button = screen.getByRole("button", { name: "再評価" });
		expect(button).toBeDisabled();
		expect(button).toHaveClass("secondary");
		expect(button).toHaveAttribute("data-slot", "button");
	});

	it("composes a link through the Radix Slot", () => {
		render(
			<Button asChild>
				<a href="/rules">Rules</a>
			</Button>
		);

		const link = screen.getByRole("link", { name: "Rules" });
		expect(link).toHaveAttribute("href", "/rules");
		expect(link).toHaveClass("primary");
	});
});
