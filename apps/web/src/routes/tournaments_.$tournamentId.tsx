import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/tournaments_/$tournamentId")({
	component: TournamentPage,
});

function TournamentPage() {
	const { tournamentId } = Route.useParams();
	const tournament = useQuery(
		trpc.tournaments.byId.queryOptions({ id: tournamentId })
	);
	const systems = useQuery(trpc.systems.list.queryOptions());
	const item = tournament.data;
	const active =
		item?.revisions.find((revision) => revision.id === item.activeRevisionId) ??
		item?.revisions.at(-1);
	const versions =
		systems.data?.flatMap((system) =>
			system.versions.map((version) => ({
				...version,
				systemName: system.name,
			}))
		) ?? [];
	async function assign(value: string) {
		await trpcClient.tournaments.setDefaultSystem.mutate({
			tournamentId,
			systemVersionId: value || null,
		});
		await queryClient.invalidateQueries();
	}
	return (
		<main className="page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">{item?.family ?? "TOURNAMENT"}</p>
					<h1>{item?.name ?? "読み込み中…"}</h1>
					<p>
						Revision {active?.revisionNumber ?? "—"} · {active?.boardCount ?? 0}{" "}
						boards · {active?.scoreType ?? "—"}
					</p>
				</div>
				<label className="inline-control">
					標準System
					<select
						onChange={(event) => assign(event.target.value)}
						value={item?.defaultSystemVersionId ?? ""}
					>
						<option value="">未設定</option>
						{versions.map((version) => (
							<option key={version.id} value={version.id}>
								{version.systemName} v{version.versionNumber}
							</option>
						))}
					</select>
				</label>
			</div>
			<section className="metric-grid">
				<article className="metric accent">
					<small>Score</small>
					<strong>{active?.tournamentScore ?? "—"}</strong>
					<span>{active?.scoreType}</span>
				</article>
				<article className="metric">
					<small>Rank</small>
					<strong>{active?.rank ?? "—"}</strong>
					<span>/ {active?.participantCount ?? "—"}</span>
				</article>
				<article className="metric">
					<small>Completion</small>
					<strong className="metric-word">{active?.completion ?? "—"}</strong>
					<span>Funbridge status</span>
				</article>
				<article className="metric">
					<small>Revisions</small>
					<strong>{item?.revisions.length ?? 0}</strong>
					<span>原文を不変保存</span>
				</article>
			</section>
			<section className="panel table-panel">
				<div className="panel-title">
					<h2>Boards</h2>
					<span>Rule evaluationへ</span>
				</div>
				<div className="board-grid">
					{active?.boards.map((board) => (
						<Link
							className="board-tile"
							key={board.id}
							params={{ boardId: board.id }}
							to="/boards/$boardId"
						>
							<span>BOARD {board.boardNumber}</span>
							<strong>{board.contract ?? "—"}</strong>
							<small>
								{board.score?.value ?? "—"} {board.score?.type}
							</small>
							<b>詳細 →</b>
						</Link>
					))}
				</div>
			</section>
		</main>
	);
}
