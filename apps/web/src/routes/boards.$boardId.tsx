import { env } from "@bridge-portal/env/web";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { queryClient, trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/boards/$boardId")({
	component: BoardPage,
});
const seatNames = { N: "North", E: "East", S: "South", W: "West" } as const;
const order = ["N", "E", "S", "W"] as const;
const auctionOrder = ["W", "N", "E", "S"] as const;
const suitSymbols = ["♠", "♥", "♦", "♣"] as const;
const dealPrefixPattern = /^[NESW]:/;
const whitespacePattern = /\s+/;
const overrideVerdicts = [
	"COMPLIED",
	"DEVIATED_WRONG_APPLICATION",
	"DEVIATED_MISSED_OPPORTUNITY",
	"INDETERMINATE",
	"NOT_APPLICABLE",
] as const;

interface DdsResponse {
	actualContractMaxTricks: number | null;
	ddTable: Record<string, number>;
	error?: string;
	par: { contracts: string[]; score: number };
	solverVersion: string;
}

function getAuctionIndent(
	calls: Array<{ seat: (typeof auctionOrder)[number] }>
): number {
	return calls[0] ? auctionOrder.indexOf(calls[0].seat) : 0;
}

function BoardPage() {
	const { boardId } = Route.useParams();
	const board = useQuery(trpc.boards.byId.queryOptions({ id: boardId }));
	const systems = useQuery(trpc.systems.list.queryOptions());
	const [ddsStatus, setDdsStatus] = useState("");
	const [correction, setCorrection] = useState<{
		evaluationId: string;
		verdict: (typeof overrideVerdicts)[number];
	}>();
	const [correctionReason, setCorrectionReason] = useState("");
	const item = board.data;
	const heroSeat = item?.heroSeat;
	const auctionCalls = [...(item?.auctionCalls ?? [])].sort(
		(left, right) => left.callIndex - right.callIndex
	);
	const playActions = [...(item?.playActions ?? [])].sort(
		(left, right) => left.actionIndex - right.actionIndex
	);
	const auctionIndent = getAuctionIndent(auctionCalls);
	const versions =
		systems.data?.flatMap((system) =>
			system.versions.map((version) => ({
				...version,
				systemName: system.name,
			}))
		) ?? [];
	const handValues =
		item?.deal.pbnDeal
			.replace(dealPrefixPattern, "")
			.split(whitespacePattern) ?? [];
	const firstSeat = item?.deal.pbnDeal.slice(0, 1) as keyof typeof seatNames;
	const hands = Object.fromEntries(
		handValues.map((hand, index) => [
			order[(order.indexOf(firstSeat) + index) % 4],
			hand,
		])
	);

	async function assign(value: string) {
		await trpcClient.boards.setSystem.mutate({
			boardId,
			systemVersionId: value || null,
		});
		await queryClient.invalidateQueries();
	}

	async function submitCorrection(event: FormEvent) {
		event.preventDefault();
		if (!correction || correctionReason.trim().length < 3) {
			return;
		}
		await trpcClient.boards.override.mutate({
			evaluationId: correction.evaluationId,
			reason: correctionReason,
			verdict: correction.verdict,
		});
		await queryClient.invalidateQueries();
		setCorrection(undefined);
		setCorrectionReason("");
	}

	function solveDoubleDummy() {
		if (!item) {
			return;
		}
		setDdsStatus("解析中…");
		const ddsWorker = new Worker(
			new URL("../workers/dds.worker.ts", import.meta.url),
			{ type: "module" }
		);
		ddsWorker.onmessage = async (event: MessageEvent<DdsResponse>) => {
			ddsWorker.terminate();
			if (event.data.error) {
				setDdsStatus(`解析失敗: ${event.data.error}`);
				return;
			}
			await trpcClient.boards.saveDoubleDummy.mutate({
				actualContractMaxTricks: event.data.actualContractMaxTricks,
				boardId,
				ddTable: event.data.ddTable,
				par: event.data.par,
				solverVersion: event.data.solverVersion,
			});
			await queryClient.invalidateQueries();
			setDdsStatus("解析を保存しました");
		};
		ddsWorker.postMessage({
			contract: item.contract ?? undefined,
			dealer: item.deal.dealer,
			declarer: item.declarer ?? undefined,
			pbnDeal: item.deal.pbnDeal,
			vulnerability: item.deal.vulnerability,
		});
	}

	return (
		<main className="page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">
						<Link
							params={{ tournamentId: item?.tournament.id ?? "" }}
							to="/tournaments/$tournamentId"
						>
							{item?.tournament.name ?? "Tournament"}
						</Link>
					</p>
					<h1>Board {item?.boardNumber ?? "—"}</h1>
					<p>
						{item?.contract ?? "Contract不明"} · Declarer{" "}
						{item?.declarer ?? "—"} · Result {item?.result ?? "—"}
					</p>
				</div>
				<div className="heading-actions">
					<a
						className="secondary button-link"
						href={`${env.VITE_SERVER_URL}/api/boards/${boardId}/export.pbn`}
						rel="noreferrer"
						target="_blank"
					>
						PBN Export
					</a>
					<label className="inline-control">
						使用System
						<select
							onChange={(event) => assign(event.target.value)}
							value={item?.systemVersionId ?? ""}
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
			</div>
			<div className="board-layout">
				<section className="panel">
					<div className="panel-title">
						<h2>Deal</h2>
						<span>{item?.deal.vulnerability} vulnerable</span>
					</div>
					<div className="deal-table">
						{order.map((seat) => (
							<div key={seat}>
								<strong>
									{seatNames[seat]}
									{item?.heroSeat === seat ? " · YOU" : ""}
								</strong>
								<p>
									{String(hands[seat] ?? "—")
										.split(".")
										.map((cards, index) => (
											<span key={`${seat}-${suitSymbols[index]}`}>
												{suitSymbols[index]} {cards || "—"}
											</span>
										))}
								</p>
							</div>
						))}
					</div>
				</section>
				<section className="panel">
					<div className="panel-title">
						<h2>Auction</h2>
						<span>{item?.auctionCalls.length ?? 0} calls</span>
					</div>
					<div className="auction-grid">
						<b>W</b>
						<b>N</b>
						<b>E</b>
						<b>S</b>
						{auctionOrder.slice(0, auctionIndent).map((seat) => (
							<i aria-hidden="true" key={`auction-indent-${seat}`} />
						))}
						{auctionCalls.map((call) => (
							<span
								className={call.seat === heroSeat ? "hero-action" : ""}
								key={call.id}
							>
								{call.call}
								{call.alert ? "*" : ""}
							</span>
						))}
					</div>
					<h3 className="section-label">Play replay</h3>
					<div className="play-strip">
						{playActions.length ? (
							playActions.map((action) => (
								<span
									className={action.seat === heroSeat ? "hero-action" : ""}
									key={action.id}
									title={`Trick ${action.trickNumber} · ${action.seat}`}
								>
									{action.card}
								</span>
							))
						) : (
							<p>Playデータなし</p>
						)}
					</div>
				</section>
			</div>
			<section className="panel evaluation-panel">
				<div className="panel-title">
					<div>
						<p className="eyebrow">ALL RULE EVALUATIONS</p>
						<h2>22項目の判定</h2>
					</div>
					<span>{item?.evaluationRun?.ruleEngineVersion ?? "—"}</span>
				</div>
				{correction && (
					<form className="correction-form" onSubmit={submitCorrection}>
						<strong>{correction.verdict}へ訂正</strong>
						<input
							autoFocus
							onChange={(event) => setCorrectionReason(event.target.value)}
							placeholder="訂正理由（必須）"
							required
							value={correctionReason}
						/>
						<button className="primary" type="submit">
							保存
						</button>
						<button
							className="secondary"
							onClick={() => setCorrection(undefined)}
							type="button"
						>
							取消
						</button>
					</form>
				)}
				<div className="evaluation-list">
					{item?.evaluations.map((evaluation) => {
						const verdict =
							evaluation.override?.verdict ?? evaluation.automaticVerdict;
						const officialItemId =
							evaluation.ruleVersionId.split("@")[0] ??
							evaluation.ruleVersionId;
						return (
							<article key={evaluation.id}>
								<span className={`verdict ${verdict.toLowerCase()}`}>
									{verdict}
								</span>
								<div>
									<Link search={{ rule: officialItemId }} to="/rules">
										<strong>{evaluation.ruleVersionId}</strong>
									</Link>
									<p>{evaluation.override?.reason ?? evaluation.reasonCode}</p>
								</div>
								<select
									aria-label={`${evaluation.ruleVersionId}を手動訂正`}
									defaultValue=""
									onChange={(event) => {
										const selected = event.target
											.value as (typeof overrideVerdicts)[number];
										if (selected) {
											setCorrection({
												evaluationId: evaluation.id,
												verdict: selected,
											});
										}
									}}
								>
									<option value="">訂正…</option>
									{overrideVerdicts.map((value) => (
										<option key={value} value={value}>
											{value}
										</option>
									))}
								</select>
							</article>
						);
					})}
				</div>
			</section>
			<section className="panel dd-panel">
				<div>
					<p className="eyebrow">DOUBLE DUMMY</p>
					<h2>DDS WebAssembly</h2>
					<p>
						{item?.doubleDummy
							? "保存済みのDD TableとParを表示しています。"
							: "端末内のWeb Workerで解析し、DD Table・Par・実Contractの最大トリックだけを保存します。"}
					</p>
					<button
						className="primary"
						disabled={ddsStatus === "解析中…"}
						onClick={solveDoubleDummy}
						type="button"
					>
						{ddsStatus || (item?.doubleDummy ? "再解析" : "DDSで解析")}
					</button>
				</div>
				{item?.doubleDummy && (
					<div>
						<pre>{JSON.stringify(item.doubleDummy.ddTable, null, 2)}</pre>
						<p>
							Par {item.doubleDummy.par.score}:{" "}
							{item.doubleDummy.par.contracts.join(", ")}
						</p>
						<p>
							実Contract最大 {item.doubleDummy.actualContractMaxTricks ?? "—"}{" "}
							tricks
						</p>
					</div>
				)}
			</section>
		</main>
	);
}
