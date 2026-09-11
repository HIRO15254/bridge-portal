import { Dds, Direction, loadDds, Vulnerable } from "bridge-dds";

interface DdsRequest {
	contract?: string;
	dealer: "N" | "E" | "S" | "W";
	declarer?: "N" | "E" | "S" | "W";
	pbnDeal: string;
	vulnerability: "None" | "NS" | "EW" | "Both";
}

const seatNames = ["N", "E", "S", "W"] as const;
const strainNames = ["S", "H", "D", "C", "NT"] as const;
const contractPattern = /^[1-7](C|D|H|S|NT)/i;
const worker = self as unknown as {
	onmessage: ((event: MessageEvent<DdsRequest>) => Promise<void>) | null;
	postMessage: (message: unknown) => void;
};

function direction(seat: DdsRequest["dealer"]): number {
	return {
		N: Direction.North,
		E: Direction.East,
		S: Direction.South,
		W: Direction.West,
	}[seat];
}

function vulnerable(value: DdsRequest["vulnerability"]): number {
	return {
		None: Vulnerable.None,
		Both: Vulnerable.Both,
		NS: Vulnerable.NorthSouth,
		EW: Vulnerable.EastWest,
	}[value];
}

worker.onmessage = async ({ data }) => {
	try {
		const module = await loadDds();
		const dds = new Dds(module);
		const table = dds.CalcDDTablePBN({ cards: data.pbnDeal });
		const par = dds.DealerPar(
			table,
			direction(data.dealer),
			vulnerable(data.vulnerability)
		);
		const ddTable = Object.fromEntries(
			strainNames.flatMap((strain, strainIndex) =>
				seatNames.map((seat, seatIndex) => [
					`${seat}:${strain}`,
					table.resTable[strainIndex]?.[seatIndex] ?? 0,
				])
			)
		);
		const contract = contractPattern.exec(data.contract ?? "");
		const strainIndex = contract
			? strainNames.indexOf(
					contract[1]?.toUpperCase() as (typeof strainNames)[number]
				)
			: -1;
		const seatIndex = data.declarer ? seatNames.indexOf(data.declarer) : -1;
		const actualContractMaxTricks =
			strainIndex >= 0 && seatIndex >= 0
				? (table.resTable[strainIndex]?.[seatIndex] ?? null)
				: null;
		worker.postMessage({
			actualContractMaxTricks,
			ddTable,
			par,
			solverVersion: "bridge-dds-1.4.0",
		});
	} catch (error) {
		worker.postMessage({
			error: error instanceof Error ? error.message : "DDS_ERROR",
		});
	}
};
