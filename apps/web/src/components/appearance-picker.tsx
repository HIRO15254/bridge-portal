import { IconSunMoon } from "@tabler/icons-react";
import { useEffect, useState } from "react";

type Appearance = "auto" | "light" | "dark";
function savedAppearance(): Appearance {
	try {
		const value = localStorage.getItem("bridge-portal-appearance");
		return value === "dark" || value === "light" ? value : "auto";
	} catch {
		return "auto";
	}
}
export function AppearancePicker() {
	const [appearance, setAppearance] = useState(savedAppearance);
	useEffect(() => {
		document.documentElement.style.colorScheme =
			appearance === "auto" ? "light dark" : appearance;
		try {
			localStorage.setItem("bridge-portal-appearance", appearance);
		} catch {
			/* Private browsing can disable storage. */
		}
	}, [appearance]);
	return (
		<label className="appearance-picker">
			<IconSunMoon aria-hidden="true" size={16} stroke={1.7} />
			<span className="sr-only">配色</span>
			<select
				aria-label="配色"
				onChange={(event) => setAppearance(event.target.value as Appearance)}
				value={appearance}
			>
				<option value="auto">自動</option>
				<option value="light">ライト</option>
				<option value="dark">ダーク</option>
			</select>
		</label>
	);
}
