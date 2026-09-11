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
	const [message, setMessage] = useState("");
	async function create(event: FormEvent) {
		event.preventDefault();
		if (!name.trim()) {
			return;
		}
		setBusy("create");
		setMessage("");
		try {
			await trpcClient.systems.create.mutate({ name });
			setName("");
			await queryClient.invalidateQueries();
			setMessage("Draftを作成しました。");
		} catch (error) {
			setMessage(`Draftを作成できませんでした: ${errorText(error)}`);
		} finally {
			setBusy("");
		}
	}
	async function publish(systemId: string) {
		setBusy(systemId);
		setMessage("");
		try {
			await trpcClient.systems.publish.mutate({ systemId });
			await queryClient.invalidateQueries();
			setMessage("変更不能な新しいSystem Versionを公開しました。");
		} catch (error) {
			setMessage(`公開できませんでした: ${errorText(error)}`);
		} finally {
			setBusy("");
		}
	}
	async function saveDraft(
		systemId: string,
		data: Parameters<typeof trpcClient.systems.updateDraft.mutate>[0]
	) {
		setBusy(`${systemId}:draft`);
		setMessage("");
		try {
			await trpcClient.systems.updateDraft.mutate(data);
			await queryClient.invalidateQueries();
			setMessage("Draftを保存しました。");
		} catch (error) {
			setMessage(`Draftを保存できませんでした: ${errorText(error)}`);
		} finally {
			setBusy("");
		}
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
			{message && (
				<p aria-live="polite" className="notice">
					{message}
				</p>
			)}
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

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : "不明なエラー";
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
		const selectedSmallLead = String(data.get("fromSmall"));
		const selectedAkLead = String(data.get("fromAk"));
		const leadVariants = selectedVariants["A-CA-01"] ?? [];
		selectedVariants["A-CA-01"] = [
			...leadVariants.filter(
				(variant) =>
					![
						"Fourth highest",
						"Top of Nothing",
						"MUD",
						"A from AK",
						"K from AK",
					].includes(variant)
			),
			{
				FOURTH_HIGHEST: "Fourth highest",
				MUD: "MUD",
				TOP_OF_NOTHING: "Top of Nothing",
			}[selectedSmallLead] ?? "Fourth highest",
			`${selectedAkLead} from AK`,
		];
		await onSave({
			systemId,
			adoptedOfficialItemIds,
			selectedVariants,
			settings: {
				opening: {
					allowSingletonTopHonor: data.has("allowSingletonTopHonor"),
					fourPlusLevelMaxHcp: numberValue(data, "fourPlusLevelMaxHcp"),
					fourPlusLevelMinHcp: numberValue(data, "fourPlusLevelMinHcp"),
					fourPlusLevelMinLength: numberValue(data, "fourPlusLevelMinLength"),
					naturalStrongTwoMinLength: numberValue(
						data,
						"naturalStrongTwoMinLength"
					),
					oneLevelMinHcp: numberValue(data, "openingOneLevelMinHcp"),
					oneClubMinLength: numberValue(data, "oneClubMinLength"),
					oneDiamondMinLength: numberValue(data, "oneDiamondMinLength"),
					oneMajorMinLength: numberValue(data, "oneMajorMinLength"),
					oneNtMinHcp: numberValue(data, "oneNtMinHcp"),
					oneNtMaxHcp: numberValue(data, "oneNtMaxHcp"),
					naturalStrongTwoMinHcp: numberValue(data, "naturalStrongTwoMinHcp"),
					threeLevelMaxHcp: numberValue(data, "threeLevelMaxHcp"),
					threeLevelMinHcp: numberValue(data, "threeLevelMinHcp"),
					threeLevelMinLength: numberValue(data, "threeLevelMinLength"),
					threeNtMaxHcp: numberValue(data, "threeNtMaxHcp"),
					threeNtMinHcp: numberValue(data, "threeNtMinHcp"),
					twoNtMaxHcp: numberValue(data, "twoNtMaxHcp"),
					twoNtMinHcp: numberValue(data, "twoNtMinHcp"),
					weakTwoMinHcp: numberValue(data, "weakTwoMinHcp"),
					weakTwoMaxHcp: numberValue(data, "weakTwoMaxHcp"),
				},
				responseRebid: {
					minimumResponseHcp: numberValue(data, "minimumResponseHcp"),
					invitationalMinHcp: numberValue(data, "invitationalMinHcp"),
					gameForcingMinHcp: numberValue(data, "gameForcingMinHcp"),
					openerRebidMinHcp: numberValue(data, "openerRebidMinHcp"),
					openerRebidNewSuitMinLength: numberValue(
						data,
						"openerRebidNewSuitMinLength"
					),
					responderRebidMinHcp: numberValue(data, "responderRebidMinHcp"),
					responderRebidNewSuitMinLength: numberValue(
						data,
						"responderRebidNewSuitMinLength"
					),
					staymanBothMajorsResponse: String(
						data.get("staymanBothMajorsResponse")
					) as "H" | "S",
					weakResponseMaxHcp: numberValue(data, "weakResponseMaxHcp"),
					weakTwoInquiryMinHcp: numberValue(data, "weakTwoInquiryMinHcp"),
					weakTwoFeatureMinimumHonor: String(
						data.get("weakTwoFeatureMinimumHonor")
					) as "A" | "K",
					weakTwoOgustMaximumMinHcp: numberValue(
						data,
						"weakTwoOgustMaximumMinHcp"
					),
					weakTwoOgustGoodSuitTopHonors: numberValue(
						data,
						"weakTwoOgustGoodSuitTopHonors"
					),
					blackwoodMinHcp: numberValue(data, "blackwoodMinHcp"),
					gerberMinHcp: numberValue(data, "gerberMinHcp"),
					grandSlamForceMinHcp: numberValue(data, "grandSlamForceMinHcp"),
					grandSlamForceGrandTopHonors: numberValue(
						data,
						"grandSlamForceGrandTopHonors"
					),
					fitShowingJumpMinHcp: numberValue(data, "fitShowingJumpMinHcp"),
				},
				overcall: {
					oneLevelMinHcp: numberValue(data, "oneLevelMinHcp"),
					oneLevelMinLength: numberValue(data, "oneLevelMinLength"),
					twoLevelMinHcp: numberValue(data, "twoLevelMinHcp"),
					twoLevelMinLength: numberValue(data, "twoLevelMinLength"),
				},
				competitive: {
					takeoutDoubleMinHcp: numberValue(data, "takeoutDoubleMinHcp"),
					balancingTakeoutDoubleMinHcp: numberValue(
						data,
						"balancingTakeoutDoubleMinHcp"
					),
					negativeDoubleMinHcp: numberValue(data, "negativeDoubleMinHcp"),
					sosRedoubleMaxHcp: numberValue(data, "sosRedoubleMaxHcp"),
					gameForcingCueMinHcp: numberValue(data, "gameForcingCueMinHcp"),
					supportCueMinHcp: numberValue(data, "supportCueMinHcp"),
					lightnerRequireVoid: data.has("lightnerRequireVoid"),
				},
				lead: {
					fromAk: selectedAkLead as "A" | "K",
					fromSmall: selectedSmallLead as
						| "FOURTH_HIGHEST"
						| "TOP_OF_NOTHING"
						| "MUD",
					honorSequence: "TOP",
				},
				signal: {
					attitude: "HIGH_ENCOURAGING",
					count: "HIGH_EVEN",
					preference: "HIGH_HIGHER_SUIT",
					priority: [
						String(data.get("signalPriority1")),
						String(data.get("signalPriority2")),
						String(data.get("signalPriority3")),
					] as ["ATTITUDE", "COUNT", "SUIT_PREFERENCE"],
				},
			},
		});
	}
	const numberFields = [
		[
			"openingOneLevelMinHcp",
			"1-level Opening 下限HCP",
			draft.settings.opening.oneLevelMinHcp,
		],
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
		["twoNtMinHcp", "Natural 2NT 下限HCP", draft.settings.opening.twoNtMinHcp],
		["twoNtMaxHcp", "Natural 2NT 上限HCP", draft.settings.opening.twoNtMaxHcp],
		[
			"threeNtMinHcp",
			"Natural 3NT 下限HCP",
			draft.settings.opening.threeNtMinHcp,
		],
		[
			"threeNtMaxHcp",
			"Natural 3NT 上限HCP",
			draft.settings.opening.threeNtMaxHcp,
		],
		[
			"naturalStrongTwoMinHcp",
			"Natural Strong Two下限",
			draft.settings.opening.naturalStrongTwoMinHcp,
		],
		[
			"naturalStrongTwoMinLength",
			"Natural Strong Two最小枚数",
			draft.settings.opening.naturalStrongTwoMinLength,
		],
		["weakTwoMinHcp", "Weak Two 下限", draft.settings.opening.weakTwoMinHcp],
		["weakTwoMaxHcp", "Weak Two 上限", draft.settings.opening.weakTwoMaxHcp],
		[
			"threeLevelMinHcp",
			"3-level Opening 下限HCP",
			draft.settings.opening.threeLevelMinHcp,
		],
		[
			"threeLevelMaxHcp",
			"3-level Opening 上限HCP",
			draft.settings.opening.threeLevelMaxHcp,
		],
		[
			"threeLevelMinLength",
			"3-level Opening 最小枚数",
			draft.settings.opening.threeLevelMinLength,
		],
		[
			"fourPlusLevelMinHcp",
			"4+-level Opening 下限HCP",
			draft.settings.opening.fourPlusLevelMinHcp,
		],
		[
			"fourPlusLevelMaxHcp",
			"4+-level Opening 上限HCP",
			draft.settings.opening.fourPlusLevelMaxHcp,
		],
		[
			"fourPlusLevelMinLength",
			"4+-level Opening 最小枚数",
			draft.settings.opening.fourPlusLevelMinLength,
		],
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
			"openerRebidMinHcp",
			"Opener Rebid下限",
			draft.settings.responseRebid.openerRebidMinHcp,
		],
		[
			"openerRebidNewSuitMinLength",
			"Opener Rebid新スーツ枚数",
			draft.settings.responseRebid.openerRebidNewSuitMinLength,
		],
		[
			"responderRebidMinHcp",
			"Responder Rebid下限",
			draft.settings.responseRebid.responderRebidMinHcp,
		],
		[
			"responderRebidNewSuitMinLength",
			"Responder Rebid新スーツ枚数",
			draft.settings.responseRebid.responderRebidNewSuitMinLength,
		],
		[
			"weakResponseMaxHcp",
			"Weak response 上限",
			draft.settings.responseRebid.weakResponseMaxHcp,
		],
		[
			"weakTwoInquiryMinHcp",
			"Weak Two 2NT Inquiry 下限",
			draft.settings.responseRebid.weakTwoInquiryMinHcp,
		],
		[
			"weakTwoOgustMaximumMinHcp",
			"Ogust maximum 下限HCP",
			draft.settings.responseRebid.weakTwoOgustMaximumMinHcp,
		],
		[
			"weakTwoOgustGoodSuitTopHonors",
			"Ogust good suitのAKQ枚数",
			draft.settings.responseRebid.weakTwoOgustGoodSuitTopHonors,
		],
		[
			"blackwoodMinHcp",
			"Blackwood目安HCP",
			draft.settings.responseRebid.blackwoodMinHcp,
		],
		[
			"gerberMinHcp",
			"Gerber目安HCP",
			draft.settings.responseRebid.gerberMinHcp,
		],
		[
			"grandSlamForceMinHcp",
			"Grand Slam Force目安HCP",
			draft.settings.responseRebid.grandSlamForceMinHcp,
		],
		[
			"grandSlamForceGrandTopHonors",
			"GSFで7を返すトップアナー枚数",
			draft.settings.responseRebid.grandSlamForceGrandTopHonors,
		],
		[
			"fitShowingJumpMinHcp",
			"Fit-showing Jump下限",
			draft.settings.responseRebid.fitShowingJumpMinHcp,
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
		[
			"takeoutDoubleMinHcp",
			"Takeout Double下限",
			draft.settings.competitive.takeoutDoubleMinHcp,
		],
		[
			"balancingTakeoutDoubleMinHcp",
			"Balancing Takeout Double下限",
			draft.settings.competitive.balancingTakeoutDoubleMinHcp,
		],
		[
			"negativeDoubleMinHcp",
			"Negative Double下限",
			draft.settings.competitive.negativeDoubleMinHcp,
		],
		[
			"sosRedoubleMaxHcp",
			"SOS Redouble上限",
			draft.settings.competitive.sosRedoubleMaxHcp,
		],
		[
			"gameForcingCueMinHcp",
			"GF Cue Bid下限",
			draft.settings.competitive.gameForcingCueMinHcp,
		],
		[
			"supportCueMinHcp",
			"Support Cue下限",
			draft.settings.competitive.supportCueMinHcp,
		],
	] as const;
	const signalOptions = ["ATTITUDE", "COUNT", "SUIT_PREFERENCE"] as const;
	const signalPriorityFields = [
		"signalPriority1",
		"signalPriority2",
		"signalPriority3",
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
						<input
							defaultChecked={draft.settings.opening.allowSingletonTopHonor}
							name="allowSingletonTopHonor"
							type="checkbox"
						/>
						Natural NTでシングルトン・トップオナーの4-4-4-1を許可
					</label>
					<label>
						Stayman 両4枚メジャー応答
						<select
							defaultValue={
								draft.settings.responseRebid.staymanBothMajorsResponse
							}
							name="staymanBothMajorsResponse"
						>
							<option value="H">2♥</option>
							<option value="S">2♠</option>
						</select>
					</label>
					<label>
						Feature ask 最低アナー
						<select
							defaultValue={
								draft.settings.responseRebid.weakTwoFeatureMinimumHonor
							}
							name="weakTwoFeatureMinimumHonor"
						>
							<option>A</option>
							<option>K</option>
						</select>
					</label>
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
					<label>
						<input
							defaultChecked={draft.settings.competitive.lightnerRequireVoid}
							name="lightnerRequireVoid"
							type="checkbox"
						/>
						Lightner Doubleは客観的なvoidを必要とする
					</label>
					{signalPriorityFields.map((field, index) => (
						<label key={field}>
							Signal優先順位 {index + 1}
							<select
								defaultValue={draft.settings.signal.priority[index]}
								name={field}
							>
								{signalOptions.map((option) => (
									<option key={option}>{option}</option>
								))}
							</select>
						</label>
					))}
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
