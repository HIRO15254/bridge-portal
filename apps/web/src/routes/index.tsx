import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
	const tournaments = useQuery(trpc.tournaments.list.queryOptions());
	const history = useQuery(trpc.history.list.queryOptions());
	const indexRows =
		history.data?.reduce((total, item) => total + item.entries.length, 0) ?? 0;
	return (
		<main className="page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">FUNBRIDGE HISTORY</p>
					<h1>実戦の履歴を、いつでも見返せる。</h1>
					<p>
						スキル出力の大会詳細と履歴索引 JSON
						を取り込み、配札・Auction・Play・成績を確認します。
					</p>
				</div>
				<Link className="primary button-link" to="/tournaments">
					＋ JSONを取り込む
				</Link>
			</div>
			<section className="metric-grid three">
				<article className="metric accent">
					<small>大会詳細</small>
					<strong>{tournaments.data?.length ?? 0}</strong>
					<span>ボードを閲覧可能</span>
				</article>
				<article className="metric">
					<small>履歴索引</small>
					<strong>{history.data?.length ?? 0}</strong>
					<span>取り込み済みファイル</span>
				</article>
				<article className="metric">
					<small>索引の大会</small>
					<strong>{indexRows}</strong>
					<span>結果未提供の大会を含む</span>
				</article>
			</section>
			<section className="panel">
				<p className="eyebrow">SUPPORTED FILES</p>
				<h2>FUNBRIDGE_EXPORT v1 / FUNBRIDGE_HISTORY_INDEX v1</h2>
				<p>
					大会詳細では完了済みボードと partial board を、履歴索引では BP
					Circuit・Series・Daily の一覧と取得範囲を保存します。
				</p>
				<Link to="/tournaments">履歴を開く →</Link>
			</section>
		</main>
	);
}
