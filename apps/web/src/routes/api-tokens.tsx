import { env } from "@bridge-portal/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/api-tokens")({
	component: ApiTokensPage,
});

function ApiTokensPage() {
	const [accessToken, setAccessToken] = useState<string>();
	const [error, setError] = useState<string>();
	const [pending, setPending] = useState(false);

	async function issueToken() {
		setPending(true);
		setError(undefined);
		try {
			const response = await fetch(
				`${env.VITE_SERVER_URL}/api/v1/import-tokens`,
				{
					body: JSON.stringify({ label: "Funbridge history import" }),
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					method: "POST",
				}
			);
			if (!response.ok) {
				throw new Error("トークンを発行できませんでした。");
			}
			const body = (await response.json()) as { accessToken: string };
			setAccessToken(body.accessToken);
		} catch (reason) {
			setError(
				reason instanceof Error
					? reason.message
					: "トークンを発行できませんでした。"
			);
		} finally {
			setPending(false);
		}
	}

	return (
		<main className="page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">API ACCESS</p>
					<h1>履歴投入用のアクセストークン</h1>
					<p>
						このブラウザでログインしたアカウントとして、Funbridge履歴の投入だけを
						許可する 12 時間有効のトークンを発行します。
					</p>
				</div>
			</div>
			<section className="panel">
				<h2>ブラウザ認証</h2>
				<p>
					発行後の値はこの画面に一度だけ表示されます。投入ツールの安全な認証情報
					ストアへ保存し、ソースコードや共有チャンネルには貼り付けないでください。
				</p>
				<Button disabled={pending} onClick={issueToken} type="button">
					{pending ? "発行中…" : "アクセストークンを発行"}
				</Button>
				{error && <p className="error">{error}</p>}
				{accessToken && (
					<div className="import-result" role="status">
						<strong>この値を今すぐ保存してください。</strong>
						<code>{accessToken}</code>
						<Button
							onClick={() => navigator.clipboard.writeText(accessToken)}
							type="button"
							variant="secondary"
						>
							コピー
						</Button>
					</div>
				)}
			</section>
		</main>
	);
}
