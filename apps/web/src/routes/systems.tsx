import {
	describeConventionTerm,
	type OfficialItemId,
} from "@bridge-portal/domain";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConventionRuleSet } from "@/components/convention-rule-set";
import { Button } from "@/components/ui/button";
import { readSystemForm, readSystemVariants } from "@/lib/system-form";
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
				<Button disabled={busy === "create"} type="submit">
					新しいDraftを作る
				</Button>
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
						<Button
							disabled={busy === system.id}
							onClick={() => publish(system.id)}
							type="button"
							variant="secondary"
						>
							{busy === system.id ? "公開中…" : "新Versionを公開"}
						</Button>
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
	const [previewSettings, setPreviewSettings] = useState(draft.settings);
	const [previewVariants, setPreviewVariants] = useState(
		draft.selectedVariants
	);
	const [previewAdopted, setPreviewAdopted] = useState(
		draft.adoptedOfficialItemIds
	);
	const [formError, setFormError] = useState("");
	function updatePreview(event: FormEvent<HTMLFormElement>) {
		const data = new FormData(event.currentTarget);
		try {
			setPreviewSettings(readSystemForm(data, draft.settings));
			setFormError("");
		} catch {
			setFormError(
				"設定値を確認してください。バランスハンドの形は1つ以上必要です。説明には直前の有効な設定を表示しています。"
			);
		}
		setPreviewVariants(readSystemVariants(data, rules));
		setPreviewAdopted(
			rules
				.filter((rule) => data.has(`rule:${rule.officialItemId}`))
				.map((rule) => rule.officialItemId)
		);
	}
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		let submittedSettings: Draft["settings"];
		try {
			submittedSettings = readSystemForm(data, draft.settings);
		} catch {
			setFormError(
				"設定値が不正なため保存できません。点数・枚数・バランスハンドの選択を確認してください。"
			);
			return;
		}
		const adoptedOfficialItemIds = rules
			.filter((rule) => data.has(`rule:${rule.officialItemId}`))
			.map((rule) => rule.officialItemId);
		const selectedVariants = readSystemVariants(data, rules);
		await onSave({
			systemId,
			adoptedOfficialItemIds,
			selectedVariants,
			settings: submittedSettings,
		});
	}
	const numberFields = [
		[
			"staymanMinHcp",
			"Stayman 通常経路の下限HCP",
			draft.settings.responseRebid.staymanMinHcp,
		],
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
			"fourPlusNtMinHcp",
			"Natural 4NT以上 下限HCP",
			draft.settings.opening.fourPlusNtMinHcp,
		],
		[
			"fourPlusNtMaxHcp",
			"Natural 4NT以上 上限HCP",
			draft.settings.opening.fourPlusNtMaxHcp,
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
			"negativeDoubleMaxLevel",
			"Negative Double上限level",
			draft.settings.competitive.negativeDoubleMaxLevel,
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
			<form onChange={updatePreview} onSubmit={submit}>
				<h3>コンベンション全体の設定 · 用語の定義</h3>
				<fieldset className="convention-global-settings">
					<legend>バランスハンド</legend>
					{(["4333", "4432", "5332", "5422"] as const).map((shape) => (
						<label key={shape}>
							<input
								defaultChecked={draft.settings.handDefinitions.balancedShapes.includes(
									shape
								)}
								name="balancedShapes"
								type="checkbox"
								value={shape}
							/>
							{shape}
							{shape === "5422" ? "（準バランスを含める拡張／従来設定）" : ""}
						</label>
					))}
					<p aria-live="polite">
						現在の定義：{describeConventionTerm("balanced", previewSettings)}
					</p>
					<small>
						このSystem内でバランスハンドを参照する説明・注釈・評価に共通で使用します。公開済みVersionは変更しません。
					</small>
				</fieldset>
				{formError && (
					<p className="error" role="alert">
						{formError}
					</p>
				)}
				<h3>Natural settings</h3>
				<div className="settings-grid">
					<label>
						<input
							defaultChecked={draft.settings.opening.oneNtFiveCardMajor}
							name="oneNtFiveCardMajor"
							type="checkbox"
						/>
						全体定義に含まれる5枚メジャーでも1NTを優先
					</label>
					<label>
						<input
							defaultChecked={
								draft.settings.responseRebid.staymanExcludeFiveCardMajor
							}
							name="staymanExcludeFiveCardMajor"
							type="checkbox"
						/>
						Stayman通常経路から5枚以上メジャーを除く
					</label>
					<label>
						<input
							defaultChecked={draft.settings.responseRebid.weakStayman}
							name="weakStayman"
							type="checkbox"
						/>
						弱いStayman経路（両M4枚・♦4枚以上→返答にPass）
					</label>
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
								{rule.variants
									.filter(
										(variant) =>
											rule.officialItemId !== "A-CA-01" ||
											variant === "Honor sequence"
									)
									.map((variant) => (
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
							{rule.officialItemId === "A-CA-01" && (
								<p>
									小札とAKの方式は上の「Small-card lead」「A/K from
									AK」で選択します。現在：{previewSettings.lead.fromSmall} /{" "}
									{previewSettings.lead.fromAk} from AK
								</p>
							)}
							<details className="convention-draft-rules">
								<summary>採用するルールの説明・条件を確認</summary>
								<ConventionRuleSet
									adopted={previewAdopted.includes(rule.officialItemId)}
									officialItemId={rule.officialItemId as OfficialItemId}
									selectedVariants={previewVariants[rule.officialItemId] ?? []}
									settings={previewSettings}
								/>
							</details>
						</div>
					))}
				</div>
				<Button disabled={busy} type="submit">
					{busy ? "保存中…" : "Draftを保存"}
				</Button>
			</form>
		</details>
	);
}
