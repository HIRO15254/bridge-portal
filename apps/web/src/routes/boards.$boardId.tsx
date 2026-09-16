import { env } from "@bridge-portal/env/web";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
interface DdsResponse {
	actualContractMaxTricks: number | null;
	ddTable: Record<string, number>;
	error?: string;
	par: { contracts: string[]; score: number };
	solverVersion: string;
}

function PlayReplay({
	actions,
	heroSeat,
}: {
	actions: Array<{
		actionIndex: number;
		card: string;
		id: string;
		seat: (typeof order)[number];
		trickNumber: number;
	}>;
	heroSeat?: (typeof order)[number] | null;
}) {
	const [cursor, setCursor] = useState(0);
	if (!actions.length) {
		return <p className="play-empty">Playデータなし</p>;
	}
	const visible = actions.slice(0, cursor);
	const trick = visible.at(-1)?.trickNumber ?? actions[0]?.trickNumber ?? 1;
	return (
		<div className="play-replay">
			<div aria-live="polite" className="replay-state">
				<strong>Trick {trick}</strong>
				<span>
					{cursor} / {actions.length} cards
				</span>
			</div>
			<div className="trick-grid">
				{order.map((seat) => (
					<div className={seat === heroSeat ? "hero-action" : ""} key={seat}>
						<small>{seat}</small>
						<strong>
							{visible.find(
								(action) => action.trickNumber === trick && action.seat === seat
							)?.card ?? "—"}
						</strong>
					</div>
				))}
			</div>
			<div className="replay-controls">
				<Button
					disabled={!cursor}
					onClick={() => setCursor(0)}
					type="button"
					variant="secondary"
				>
					最初
				</Button>
				<Button
					disabled={!cursor}
					onClick={() => setCursor((value) => Math.max(0, value - 1))}
					type="button"
					variant="secondary"
				>
					戻る
				</Button>
				<Button
					disabled={cursor === actions.length}
					onClick={() =>
						setCursor((value) => Math.min(actions.length, value + 1))
					}
					type="button"
					variant="secondary"
				>
					進む
				</Button>
				<Button
					disabled={cursor === actions.length}
					onClick={() => setCursor(actions.length)}
					type="button"
					variant="secondary"
				>
					最後
				</Button>
			</div>
		</div>
	);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This page composes the board's independent history panels.
function BoardPage() {
	const { boardId } = Route.useParams();
	const board = useQuery(trpc.boards.byId.queryOptions({ id: boardId }));
	const [ddsStatus, setDdsStatus] = useState("");
	const item = board.data;
	const auctionCalls = [...(item?.auctionCalls ?? [])].sort(
		(left, right) => left.callIndex - right.callIndex
	);
	const playActions = [...(item?.playActions ?? [])].sort(
		(left, right) => left.actionIndex - right.actionIndex
	);
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
	const historyMetadata = item?.historyMetadata;
	function solveDoubleDummy() {
		if (!item) {
			return;
		}
		setDdsStatus("解析中…");
		const worker = new Worker(
			new URL("../workers/dds.worker.ts", import.meta.url),
			{ type: "module" }
		);
		worker.onmessage = async (event: MessageEvent<DdsResponse>) => {
			worker.terminate();
			if (event.data.error) {
				return setDdsStatus(`解析失敗: ${event.data.error}`);
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
		worker.postMessage({
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
						{item?.sourceStatus ? `${item.sourceStatus} · ` : ""}
						{item?.contract ?? "Contract不明"} · Declarer{" "}
						{item?.declarer ?? "—"} · Result {item?.result ?? "—"}
					</p>
				</div>
				<a
					className="secondary button-link"
					href={`${env.VITE_SERVER_URL}/api/boards/${boardId}/export.pbn`}
					rel="noreferrer"
					target="_blank"
				>
					PBN Export
				</a>
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
						<span>{auctionCalls.length} calls</span>
					</div>
					<div className="auction-grid">
						<b>W</b>
						<b>N</b>
						<b>E</b>
						<b>S</b>
						{auctionOrder
							.slice(
								0,
								auctionCalls[0] ? auctionOrder.indexOf(auctionCalls[0].seat) : 0
							)
							.map((seat) => (
								<i aria-hidden="true" key={seat} />
							))}
						{auctionCalls.map((call) => (
							<span
								className={call.seat === item?.heroSeat ? "hero-action" : ""}
								key={call.id}
							>
								{call.call}
								{call.alert ? "*" : ""}
							</span>
						))}
					</div>
					<h3 className="section-label">Play replay</h3>
					<PlayReplay actions={playActions} heroSeat={item?.heroSeat} />
				</section>
			</div>
			{historyMetadata &&
				(Object.keys(historyMetadata.comparison ?? {}).length > 0 ||
					Object.keys(historyMetadata.source ?? {}).length > 0) && (
					<section className="panel">
						<div className="panel-title">
							<h2>Funbridge results</h2>
							<span>契約分布・取得情報</span>
						</div>
						{historyMetadata.comparison && (
							<details open>
								<summary>本人結果・契約分布</summary>
								<pre>{JSON.stringify(historyMetadata.comparison, null, 2)}</pre>
							</details>
						)}
						{historyMetadata.source && (
							<details>
								<summary>取得元</summary>
								<pre>{JSON.stringify(historyMetadata.source, null, 2)}</pre>
							</details>
						)}
					</section>
				)}
			<section className="panel dd-panel">
				<div>
					<p className="eyebrow">DOUBLE DUMMY</p>
					<h2>DDS WebAssembly</h2>
					<p>
						{item?.doubleDummy
							? "保存済みのDD TableとParを表示しています。"
							: "端末内のWeb Workerで解析します。"}
					</p>
					<Button
						disabled={ddsStatus === "解析中…"}
						onClick={solveDoubleDummy}
						type="button"
					>
						{ddsStatus || (item?.doubleDummy ? "再解析" : "DDSで解析")}
					</Button>
				</div>
				{item?.doubleDummy && (
					<div>
						<pre>{JSON.stringify(item.doubleDummy.ddTable, null, 2)}</pre>
						<p>
							Par {item.doubleDummy.par.score}:{" "}
							{item.doubleDummy.par.contracts.join(", ")}
						</p>
					</div>
				)}
			</section>
		</main>
	);
}
