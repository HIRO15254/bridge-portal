import { defaultSystemSettings } from "@bridge-portal/domain";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConventionRuleSet } from "../convention-rule-set";

const outsideDefinition = /適用外：全体設定/;
const definitionText = /スートの枚数を多い順/;
const notAdopted = /この方式は未採用です/;

describe("convention rule view", () => {
	it("updates the annotation and sample from the same system settings", () => {
		const settings = structuredClone(defaultSystemSettings);
		const { rerender } = render(
			<ConventionRuleSet
				officialItemId="A-OB-01"
				selectedVariants={["Natural 1NT"]}
				settings={settings}
			/>
		);
		expect(
			screen.getByRole("heading", { name: "自然言語での説明" })
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "プログラム的なルール" })
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "[注1]" })).toBeInTheDocument();
		fireEvent.click(
			screen.getByText("1NTの条件を試す", { selector: "summary" })
		);
		const sample = screen.getByRole("region", {
			name: "1NT条件のサンプル判定",
		});
		fireEvent.change(within(sample).getByLabelText("手の形"), {
			target: { value: "5332" },
		});
		expect(
			within(sample).getByText("適用：bid 1NT。1NTの条件が成立しています。")
		).toBeInTheDocument();
		settings.handDefinitions.balancedShapes = ["4333", "4432"];
		rerender(
			<ConventionRuleSet
				officialItemId="A-OB-01"
				selectedVariants={["Natural 1NT"]}
				settings={settings}
			/>
		);
		expect(within(sample).getByText(outsideDefinition)).toBeInTheDocument();
		expect(screen.getByText(definitionText).textContent).not.toContain("5332");
	});
	it("distinguishes adopted rules from a comparison-only variant", () => {
		render(
			<ConventionRuleSet
				officialItemId="A-RR-05"
				selectedVariants={["Feature ask"]}
				settings={defaultSystemSettings}
			/>
		);
		expect(screen.queryByText("Ogust 3♣")).not.toBeInTheDocument();
		fireEvent.change(screen.getByLabelText("表示する方式"), {
			target: { value: "Ogust-style ask" },
		});
		expect(screen.getByText(notAdopted)).toBeInTheDocument();
		expect(screen.getByText("Ogust 3♣")).toBeInTheDocument();
	});
});
