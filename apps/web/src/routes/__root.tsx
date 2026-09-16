import {
	IconCards,
	IconClubs,
	IconLayoutDashboard,
	IconLayoutSidebar,
	IconLogout,
} from "@tabler/icons-react";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { AppearancePicker } from "@/components/appearance-picker";
import { Button } from "@/components/ui/button";
import { registrationErrorMessage } from "@/lib/auth-error";
import {
	authClient,
	autoSignInForPreview,
	registrationIsAvailable,
	requestPreviewApiAccess,
} from "@/utils/auth";
import type { trpc } from "@/utils/trpc";

import "../index.css";
import "../styles/workspace.css";

export interface RouterAppContext {
	queryClient: QueryClient;
	trpc: typeof trpc;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{ title: "Bridge Portal | Funbridge履歴" },
			{
				name: "description",
				content: "Funbridgeの大会・ボード履歴を閲覧する個人ポータル",
			},
		],
		links: [{ rel: "icon", href: "/logo.png" }],
	}),
});

function Login() {
	const [error, setError] = useState("");
	const [mode, setMode] = useState<"login" | "register">("login");
	const [pending, setPending] = useState(false);
	const [registrationAvailable, setRegistrationAvailable] = useState(false);
	let submitLabel = "ログイン";
	if (pending) {
		submitLabel = "確認中…";
	} else if (mode === "register") {
		submitLabel = "アカウントを作成";
	}

	useEffect(() => {
		let active = true;
		registrationIsAvailable()
			.then((available) => {
				if (active) {
					setRegistrationAvailable(available);
				}
			})
			.catch(() => {
				if (active) {
					setRegistrationAvailable(false);
				}
			});
		return () => {
			active = false;
		};
	}, []);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError("");
		const data = new FormData(event.currentTarget);
		try {
			const email = String(data.get("email"));
			const password = String(data.get("password"));
			if (
				mode === "register" &&
				password !== String(data.get("passwordConfirmation"))
			) {
				setError("確認用パスワードが一致しません。");
				return;
			}
			const result =
				mode === "register"
					? await authClient.signUp.email({
							email,
							name: String(data.get("name")),
							password,
						})
					: await authClient.signIn.email({ email, password });
			if (result.error) {
				setError(
					mode === "register"
						? registrationErrorMessage(result.error)
						: "メールアドレスまたはパスワードを確認してください。"
				);
			} else {
				window.location.reload();
			}
		} catch {
			setError(
				"認証サーバーに接続できません。しばらくしてから再試行してください。"
			);
		} finally {
			setPending(false);
		}
	}
	return (
		<main className="login-page">
			<section className="login-copy">
				<p className="eyebrow">FUNBRIDGE HISTORY</p>
				<h1>
					Funbridgeの履歴を、
					<br />
					見返しやすく。
				</h1>
				<p>大会とボードの履歴を取り込み、Auction・Play・成績を確認できます。</p>
			</section>
			<form className="login-card" onSubmit={submit}>
				<div className="brand-mark">
					<IconClubs aria-hidden="true" size={24} stroke={1.7} />
				</div>
				<h2>Bridge Portal</h2>
				<p>
					{mode === "register"
						? "最初の個人アカウントを作成"
						: "個人アカウントにログイン"}
				</p>
				{mode === "register" && (
					<label>
						表示名
						<input autoComplete="name" name="name" required type="text" />
					</label>
				)}
				<label>
					メールアドレス
					<input autoComplete="email" name="email" required type="email" />
				</label>
				<label>
					パスワード
					<input
						autoComplete={
							mode === "register" ? "new-password" : "current-password"
						}
						maxLength={mode === "register" ? 128 : undefined}
						minLength={mode === "register" ? 12 : undefined}
						name="password"
						required
						type="password"
					/>
				</label>
				{mode === "register" && (
					<label>
						パスワード（確認）
						<input
							autoComplete="new-password"
							maxLength={128}
							minLength={12}
							name="passwordConfirmation"
							required
							type="password"
						/>
					</label>
				)}
				{error && (
					<p aria-live="polite" className="error">
						{error}
					</p>
				)}
				<Button disabled={pending} type="submit">
					{submitLabel}
				</Button>
				{registrationAvailable && (
					<Button
						onClick={() => {
							setError("");
							setMode(mode === "login" ? "register" : "login");
						}}
						type="button"
						variant="secondary"
					>
						{mode === "login" ? "新規登録" : "ログインへ戻る"}
					</Button>
				)}
			</form>
		</main>
	);
}

const nav = [
	["/", "Overview", IconLayoutDashboard],
	["/tournaments", "History", IconCards],
] as const;

function RootComponent() {
	const session = authClient.useSession();
	const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const pageName = nav.find(([path]) => path === pathname)?.[1] ?? "Board";

	useEffect(() => {
		if (session.isPending || session.data || autoLoginAttempted) {
			return;
		}
		setAutoLoginAttempted(true);
		autoSignInForPreview()
			.then((result) => {
				if (result === "signed-in") {
					window.location.reload();
				}
				if (
					result === "unreachable" &&
					!new URLSearchParams(window.location.search).has("previewApiAccess")
				) {
					requestPreviewApiAccess();
				}
			})
			.catch(() => {
				if (
					!new URLSearchParams(window.location.search).has("previewApiAccess")
				) {
					requestPreviewApiAccess();
				}
			});
	}, [autoLoginAttempted, session.data, session.isPending]);

	if (session.isPending || !(session.data || autoLoginAttempted)) {
		return (
			<main className="center">
				<div className="spinner" />
				読み込み中
			</main>
		);
	}
	return (
		<>
			<HeadContent />
			{session.data ? (
				<div className="app-frame">
					<aside className="app-sidebar">
						<Link className="logo" to="/">
							<span>
								<IconClubs aria-hidden="true" size={19} stroke={1.7} />
							</span>
							<strong>Bridge Portal</strong>
						</Link>
						<p className="sidebar-label">Workspace</p>
						<nav aria-label="メインナビゲーション">
							{nav.map(([to, label, Icon]) => (
								<Link
									activeOptions={{ exact: to === "/" }}
									activeProps={{ className: "active" }}
									key={to}
									to={to}
								>
									<Icon aria-hidden="true" size={18} stroke={1.7} />
									{label}
								</Link>
							))}
						</nav>
						<div className="profile">
							<span>{session.data.user.name.slice(0, 1).toUpperCase()}</span>
							<div>
								<strong>{session.data.user.name}</strong>
								<small>Solo workspace</small>
							</div>
						</div>
						<Button
							onClick={() =>
								authClient.signOut().then(() => window.location.reload())
							}
							type="button"
							variant="ghost"
						>
							<IconLogout aria-hidden="true" size={16} stroke={1.7} />
							ログアウト
						</Button>
					</aside>
					<div className="workspace">
						<header>
							<div className="workspace-breadcrumb">
								<IconLayoutSidebar aria-hidden="true" size={17} stroke={1.7} />
								<span>Workspace</span>
								<span>/</span>
								<strong>{pageName}</strong>
							</div>
							<AppearancePicker />
						</header>
						<Outlet />
					</div>
				</div>
			) : (
				<Login />
			)}
		</>
	);
}
