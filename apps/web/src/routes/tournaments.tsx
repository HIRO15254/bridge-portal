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
	const history = useQuery(trpc.history.list.queryOptions());
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
				kind?: "HISTORY_INDEX";
				rowCount?: number;
			};
			if (!response.ok) {
				setMessage(`取込に失敗しました: ${result.error ?? response.status}`);
			} else if (result.duplicate) {
				setMessage("同じFunbridge JSONはすでに取り込み済みです。");
			} else if (result.kind === "HISTORY_INDEX") {
				setMessage(`履歴索引を取り込みました（${result.rowCount ?? 0}大会）。`);
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
					<h1>Funbridge履歴を取り込む。</h1>
					<p>
						大会詳細と履歴索引 JSON
						から、局・Auction・Play・成績・取得範囲を保存します。
					</p>
				</div>
			</div>
			<form className="upload-panel" onSubmit={upload}>
				<div>
					<strong>Funbridge JSONファイル</strong>
					<p>
						最大10 MiB。FUNBRIDGE_EXPORT v1 と FUNBRIDGE_HISTORY_INDEX v1
						に対応しています。
					</p>
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
				<button className="primary" disabled={busy} type="submit">
					{busy ? "解析中…" : "取り込む"}
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
			<section className="panel table-panel">
				<div className="panel-title">
					<h2>履歴索引</h2>
					<span>
						{history.data?.reduce(
							(total, item) => total + item.entries.length,
							0
						) ?? 0}
						件
					</span>
				</div>
				{history.data?.map((index) => (
					<div className="history-index" key={index.id}>
						<p>
							<strong>{index.family}</strong> · {index.coverage.scope} ·{" "}
							{index.coverage.rowCount} / {index.coverage.totalCount} 件 ·{" "}
							{new Date(index.capturedAt).toLocaleDateString("ja-JP")}
						</p>
						<div className="table">
							{index.entries.map((entry) => (
								<div className="table-row" key={entry.id}>
									<strong>{entry.title}</strong>
									<span>
										{entry.score ?? "—"} {entry.scoreType ?? ""}
									</span>
									<span>
										{entry.rank ?? "—"} / {entry.registeredPlayerCount}
									</span>
									<span>{entry.inProgress ? "進行中" : "完了"}</span>
								</div>
							))}
						</div>
					</div>
				))}
				{history.data?.length === 0 && <p>履歴索引はまだありません。</p>}
			</section>
		</main>
	);
}
