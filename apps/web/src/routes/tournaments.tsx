import { env } from "@bridge-portal/env/web";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { queryClient, trpc } from "@/utils/trpc";

export const Route = createFileRoute("/tournaments")({
	component: TournamentsPage,
});

function TournamentsPage() {
	const tournaments = useQuery(trpc.tournaments.list.queryOptions());
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	async function upload(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setMessage("");
		try {
			const data = new FormData(event.currentTarget);
			const response = await fetch(
				`${env.VITE_SERVER_URL}/api/imports/funbridge-json`,
				{
					method: "POST",
					body: data,
					credentials: "include",
				}
			);
			const result = (await response.json()) as {
				error?: string;
				duplicate?: boolean;
				warnings?: string[];
			};
			if (!response.ok) {
				setMessage(`取込に失敗しました: ${result.error ?? response.status}`);
			} else if (result.duplicate) {
				setMessage("同じFunbridge JSONはすでに取り込み済みです。");
			} else {
				const warning = result.warnings?.length
					? `（確認: ${result.warnings.join(", ")}）`
					: "";
				setMessage(`取込が完了しました${warning}`);
			}
			if (response.ok) {
				await queryClient.invalidateQueries();
			}
		} catch (error) {
			setMessage(
				`取込に失敗しました: ${
					error instanceof Error ? error.message : "通信エラー"
				}`
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<main className="page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">TOURNAMENTS</p>
					<h1>Funbridgeの実戦を取り込む。</h1>
					<p>Funbridge JSONから、局・Auction・Play・成績を保存します。</p>
				</div>
			</div>
			<form className="upload-panel" onSubmit={upload}>
				<div>
					<strong>Funbridge JSONファイル</strong>
					<p>最大10 MiB。完全／不完全なAuction・Playのどちらも受け付けます。</p>
					<a download href="/funbridge-import-example.json">
						取込フォーマット例をダウンロード
					</a>
				</div>
				<label className="file-input">
					<input
						accept=".json,application/json"
						name="file"
						required
						type="file"
					/>
					<span>ファイルを選ぶ</span>
				</label>
				<label>
					本人席（自動判定できない場合）
					<select defaultValue="" name="heroSeat">
						<option value="">JSONから自動判定</option>
						<option>N</option>
						<option>E</option>
						<option>S</option>
						<option>W</option>
					</select>
				</label>
				<button className="primary" disabled={busy} type="submit">
					{busy ? "解析中…" : "取込・自動評価"}
				</button>
			</form>
			{message && (
				<p aria-live="polite" className="notice">
					{message}
				</p>
			)}
			<section className="panel table-panel">
				<div className="panel-title">
					<h2>保存済みトーナメント</h2>
					<span>{tournaments.data?.length ?? 0}件</span>
				</div>
				<div className="table">
					<div className="table-head">
						<span>大会</span>
						<span>Family</span>
						<span>Funbridge ID</span>
						<span>更新</span>
					</div>
					{tournaments.data?.map((item) => (
						<div className="table-row" key={item.id}>
							<Link
								params={{ tournamentId: item.id }}
								to="/tournaments/$tournamentId"
							>
								<strong>{item.name}</strong>
							</Link>
							<span className="pill">{item.family}</span>
							<span>{item.externalId}</span>
							<span>
								{new Date(item.updatedAt).toLocaleDateString("ja-JP")}
							</span>
						</div>
					))}
				</div>
			</section>
		</main>
	);
}
