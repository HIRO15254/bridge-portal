import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/systems")({ component: SystemsPage });

function SystemsPage() {
	const systems = useQuery(trpc.systems.list.queryOptions());
	const rules = useQuery(trpc.rules.list.queryOptions());
	const [name, setName] = useState("");
	const [busy, setBusy] = useState("");
	async function create(event: FormEvent) {
		event.preventDefault();
		if (!name.trim()) {
			return;
		}
		setBusy("create");
		await trpcClient.systems.create.mutate({ name });
		setName("");
		await queryClient.invalidateQueries();
		setBusy("");
	}
	async function publish(systemId: string) {
		setBusy(systemId);
		await trpcClient.systems.publish.mutate({ systemId });
		await queryClient.invalidateQueries();
		setBusy("");
	}
	async function saveDraft(
		systemId: string,
		data: Parameters<typeof trpcClient.systems.updateDraft.mutate>[0]
	) {
		setBusy(`${systemId}:draft`);
		await trpcClient.systems.updateDraft.mutate(data);
		await queryClient.invalidateQueries();
		setBusy("");
	}
	return (
		<main className="page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">MY SYSTEMS</p>
					<h1>自分の基準を、版として残す。</h1>
					<p>公開したVersionは変更せず、振り返りの基準を守ります。</p>
				</div>
			</div>
			<form className="create-system" onSubmit={create}>
				<input
					onChange={(event) => setName(event.target.value)}
					placeholder="例: Standard 15–17 NT"
					value={name}
				/>
				<button className="primary" disabled={busy === "create"} type="submit">
					新しいDraftを作る
				</button>
			</form>
			<section className="card-grid">
				{systems.data?.map((system) => (
					<article className="system-card" key={system.id}>
						<div className="card-top">
							<span>♢</span>
							<small>DRAFT + {system.versions.length} VERSION</small>
						</div>
						<h2>{system.name}</h2>
						<p>JCBL_LIST_A_2026_05_01</p>
						<div className="system-meta">
							<span>
								<b>{system.draft?.adoptedOfficialItemIds.length ?? 0}</b>{" "}
								採用ルール
							</span>
							<span>
								<b>{system.versions.length}</b> 公開版
							</span>
						</div>
						<button
							className="secondary"
							disabled={busy === system.id}
							onClick={() => publish(system.id)}
							type="button"
						>
							{busy === system.id ? "公開中…" : "新Versionを公開"}
						</button>
						{system.draft && (
							<SystemEditor
								busy={busy === `${system.id}:draft`}
								draft={system.draft}
								onSave={(data) => saveDraft(system.id, data)}
								rules={rules.data ?? []}
								systemId={system.id}
							/>
						)}
					</article>
				))}
			</section>
			{systems.data?.length === 0 && (
				<div className="empty panel">
					<strong>まだSystemがありません</strong>
					<p>Draftを作り、初期値を確認して最初のVersionを公開してください。</p>
				</div>
			)}
		</main>
	);
}

type Draft = NonNullable<
	Awaited<ReturnType<typeof trpcClient.systems.list.query>>[number]["draft"]
>;
type Rules = Awaited<ReturnType<typeof trpcClient.rules.list.query>>;

function numberValue(data: FormData, name: string): number {
	return Number(data.get(name));
}

function SystemEditor({
	busy,
	draft,
	onSave,
	rules,
	systemId,
}: {
	busy: boolean;
	draft: Draft;
	onSave: (
		data: Parameters<typeof trpcClient.systems.updateDraft.mutate>[0]
	) => Promise<void>;
	rules: Rules;
	systemId: string;
}) {
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const adoptedOfficialItemIds = rules
			.filter((rule) => data.has(`rule:${rule.officialItemId}`))
			.map((rule) => rule.officialItemId);
		const selectedVariants = Object.fromEntries(
			rules.map((rule) => [
				rule.officialItemId,
				rule.variants.filter((variant) =>
					data.has(`variant:${rule.officialItemId}:${variant}`)
				),
			])
		);
		await onSave({
			systemId,
			adoptedOfficialItemIds,
			selectedVariants,
			settings: {
				opening: {
					oneClubMinLength: numberValue(data, "oneClubMinLength"),
					oneDiamondMinLength: numberValue(data, "oneDiamondMinLength"),
					oneMajorMinLength: numberValue(data, "oneMajorMinLength"),
					oneNtMinHcp: numberValue(data, "oneNtMinHcp"),
					oneNtMaxHcp: numberValue(data, "oneNtMaxHcp"),
					weakTwoMinHcp: numberValue(data, "weakTwoMinHcp"),
					weakTwoMaxHcp: numberValue(data, "weakTwoMaxHcp"),
				},
				responseRebid: {
					minimumResponseHcp: numberValue(data, "minimumResponseHcp"),
					invitationalMinHcp: numberValue(data, "invitationalMinHcp"),
					gameForcingMinHcp: numberValue(data, "gameForcingMinHcp"),
				},
				overcall: {
					oneLevelMinHcp: numberValue(data, "oneLevelMinHcp"),
					oneLevelMinLength: numberValue(data, "oneLevelMinLength"),
					twoLevelMinHcp: numberValue(data, "twoLevelMinHcp"),
					twoLevelMinLength: numberValue(data, "twoLevelMinLength"),
				},
				lead: {
					fromAk: String(data.get("fromAk")) as "A" | "K",
					fromSmall: String(data.get("fromSmall")) as
						| "FOURTH_HIGHEST"
						| "TOP_OF_NOTHING"
						| "MUD",
					honorSequence: "TOP",
				},
				signal: {
					attitude: "HIGH_ENCOURAGING",
					count: "HIGH_EVEN",
					preference: "HIGH_HIGHER_SUIT",
					priority: ["ATTITUDE", "COUNT", "SUIT_PREFERENCE"],
				},
			},
		});
	}
	const numberFields = [
		[
			"oneClubMinLength",
			"1♣ 最小枚数",
			draft.settings.opening.oneClubMinLength,
		],
		[
			"oneDiamondMinLength",
			"1♦ 最小枚数",
			draft.settings.opening.oneDiamondMinLength,
		],
		[
			"oneMajorMinLength",
			"1M 最小枚数",
			draft.settings.opening.oneMajorMinLength,
		],
		["oneNtMinHcp", "1NT 下限HCP", draft.settings.opening.oneNtMinHcp],
		["oneNtMaxHcp", "1NT 上限HCP", draft.settings.opening.oneNtMaxHcp],
		["weakTwoMinHcp", "Weak Two 下限", draft.settings.opening.weakTwoMinHcp],
		["weakTwoMaxHcp", "Weak Two 上限", draft.settings.opening.weakTwoMaxHcp],
		[
			"minimumResponseHcp",
			"Response 下限",
			draft.settings.responseRebid.minimumResponseHcp,
		],
		[
			"invitationalMinHcp",
			"Invite 下限",
			draft.settings.responseRebid.invitationalMinHcp,
		],
		[
			"gameForcingMinHcp",
			"GF 下限",
			draft.settings.responseRebid.gameForcingMinHcp,
		],
		[
			"oneLevelMinHcp",
			"1-level OC HCP",
			draft.settings.overcall.oneLevelMinHcp,
		],
		[
			"oneLevelMinLength",
			"1-level OC 枚数",
			draft.settings.overcall.oneLevelMinLength,
		],
		[
			"twoLevelMinHcp",
			"2-level OC HCP",
			draft.settings.overcall.twoLevelMinHcp,
		],
		[
			"twoLevelMinLength",
			"2-level OC 枚数",
			draft.settings.overcall.twoLevelMinLength,
		],
	] as const;
	return (
		<details className="system-editor">
			<summary>Draftを編集</summary>
			<form onSubmit={submit}>
				<h3>Natural settings</h3>
				<div className="settings-grid">
					{numberFields.map(([name, label, value]) => (
						<label key={name}>
							{label}
							<input
								defaultValue={value}
								max="37"
								min="0"
								name={name}
								required
								type="number"
							/>
						</label>
					))}
					<label>
						A/K from AK
						<select defaultValue={draft.settings.lead.fromAk} name="fromAk">
							<option>A</option>
							<option>K</option>
						</select>
					</label>
					<label>
						Small-card lead
						<select
							defaultValue={draft.settings.lead.fromSmall}
							name="fromSmall"
						>
							<option value="FOURTH_HIGHEST">Fourth highest</option>
							<option value="TOP_OF_NOTHING">Top of Nothing</option>
							<option value="MUD">MUD</option>
						</select>
					</label>
				</div>
				<h3>採用Rule / Variant</h3>
				<div className="rule-selector">
					{rules.map((rule) => (
						<div key={rule.officialItemId}>
							<label>
								<input
									defaultChecked={draft.adoptedOfficialItemIds.includes(
										rule.officialItemId
									)}
									name={`rule:${rule.officialItemId}`}
									type="checkbox"
								/>
								<strong>
									{rule.officialItemId} {rule.title}
								</strong>
							</label>
							<div>
								{rule.variants.map((variant) => (
									<label key={variant}>
										<input
											defaultChecked={draft.selectedVariants[
												rule.officialItemId
											]?.includes(variant)}
											name={`variant:${rule.officialItemId}:${variant}`}
											type="checkbox"
										/>
										{variant}
									</label>
								))}
							</div>
						</div>
					))}
				</div>
				<button className="primary" disabled={busy} type="submit">
					{busy ? "保存中…" : "Draftを保存"}
				</button>
			</form>
		</details>
	);
}
