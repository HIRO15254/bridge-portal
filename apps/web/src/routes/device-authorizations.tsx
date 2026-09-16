import { env } from "@bridge-portal/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/device-authorizations")({
	component: DeviceAuthorizationPage,
	validateSearch: (search) => ({
		userCode: typeof search.user_code === "string" ? search.user_code : "",
	}),
});

function DeviceAuthorizationPage() {
	const { userCode } = Route.useSearch();
	const [code, setCode] = useState(userCode);
	const [error, setError] = useState<string>();
	const [approved, setApproved] = useState(false);
	const [pending, setPending] = useState(false);

	async function approve() {
		setPending(true);
		setError(undefined);
		try {
			const response = await fetch(
				`${env.VITE_SERVER_URL}/api/v1/device-authorizations/approve`,
				{
					body: JSON.stringify({ userCode: code }),
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					method: "POST",
				}
			);
			if (!response.ok) {
				throw new Error(
					"認証コードを承認できませんでした。期限を確認してください。"
				);
			}
			setApproved(true);
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "認証コードを承認できませんでした。"
			);
		} finally {
			setPending(false);
		}
	}

	return (
		<main className="page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">DEVICE AUTHORIZATION</p>
					<h1>端末からの履歴投入を承認</h1>
					<p>
						SkillまたはChrome拡張機能から要求された、Funbridge履歴の投入だけを承認します。
					</p>
				</div>
			</div>
			<section className="panel">
				{approved ? (
					<p className="import-result" role="status">
						<strong>承認しました。</strong>{" "}
						この画面は閉じて構いません。端末側で投入が始まります。
					</p>
				) : (
					<>
						<label htmlFor="user-code">認証コード</label>
						<input
							autoComplete="one-time-code"
							id="user-code"
							onChange={(event) => setCode(event.target.value)}
							value={code}
						/>
						<p>
							コードは10分で失効します。承認しても、長いアクセストークンは表示されません。
						</p>
						<Button
							disabled={pending || !code.trim()}
							onClick={approve}
							type="button"
						>
							{pending ? "承認中…" : "この端末を承認"}
						</Button>
						{error && <p className="error">{error}</p>}
					</>
				)}
			</section>
		</main>
	);
}
