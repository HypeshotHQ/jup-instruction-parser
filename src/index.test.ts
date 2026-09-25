import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { extract } from "./index";
import { fixtureConnection, loadParsedTransaction } from "./__fixtures__/load";
import * as instructionParserModule from "./lib/instruction-parser";

// A real 4-hop Jupiter v6 swap (SOL -> 3ZLek…), captured from mainnet.
const FIXTURE = "jupiter-spl-2SxaABxi";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

/** Plain data, BigInts as strings, so results compare with deepEqual. */
const plain = (value: unknown) =>
	JSON.parse(
		JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
	);

const USD_FIELDS = [
	"volumeInUSD",
	"inAmountInUSD",
	"outAmountInUSD",
	"exactInAmountInUSD",
	"exactOutAmountInUSD",
	"feeAmountInUSD",
];

async function run() {
	let httpRequests = 0;
	globalThis.fetch = (async () => {
		httpRequests += 1;
		throw new Error("extract() must not make HTTP requests");
	}) as typeof fetch;
	const tx = loadParsedTransaction(FIXTURE);
	const connection = fixtureConnection(FIXTURE);
	const swap = await extract(
		tx.transaction.signatures[0],
		connection,
		tx,
		tx.blockTime,
	);
	return { swap: plain(swap), httpRequests, rpcCalls: connection.requested.length };
}

describe("extract", () => {
	// Building the parser builds a BorshCoder over the whole Jupiter IDL:
	// ~12ms of synchronous CPU, which used to be paid on every swap.
	it("reuses one instruction parser instead of building one per call", async () => {
		const mod = instructionParserModule as {
			InstructionParser: typeof instructionParserModule.InstructionParser;
		};
		const Original = mod.InstructionParser;
		let constructed = 0;
		mod.InstructionParser = class extends Original {
			constructor(...args: ConstructorParameters<typeof Original>) {
				super(...args);
				constructed += 1;
			}
		};
		try {
			await run();
			await run();
		} finally {
			mod.InstructionParser = Original;
		}
		assert.equal(constructed, 0);
	});

	it("makes no HTTP request; its only I/O is one getMultipleAccountsInfo", async () => {
		const { httpRequests, rpcCalls } = await run();
		assert.equal(httpRequests, 0);
		assert.equal(rpcCalls, 1);
	});

	// Recorded from @hypeshot/instruction-parser 1.0.29 on this transaction, with
	// its USD fields removed: dropping prices must not move anything else.
	it("returns the same swap as 1.0.29, minus the USD fields", async () => {
		const { swap } = await run();
		assert.deepEqual(swap, {
			transferAuthority: "7LRQ8UVVNPo7LFGDo3teYBnW5XEJAXAUgYjh91pZKETN",
			lastAccount: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
			instruction: "sharedAccountsRouteV2",
			owner: "7LRQ8UVVNPo7LFGDo3teYBnW5XEJAXAUgYjh91pZKETN",
			programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
			signature:
				"2SxaABxidFcNPEnYpFiex9FtJPB4ZD1ofqEtpKUTgzEsHfRh8iX2by8bsa9gcxDFRrgCXU961dj2bTeMppwdUJYZ",
			timestamp: "2026-09-17T03:57:10.000Z",
			legCount: 4,
			inSymbol: null,
			inAmount: "49586023780",
			inAmountInDecimal: 49.58602378,
			inMint: "So11111111111111111111111111111111111111112",
			outSymbol: null,
			outAmount: "1823499024682",
			outAmountInDecimal: 1823.499024682,
			outMint: "3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG",
			exactOutAmount: "1823625055989",
			swapData: BASELINE_HOPS,
		});
	});

	it("carries no USD field, at the top level or per hop", async () => {
		const { swap } = await run();
		for (const field of USD_FIELDS) assert.equal(field in swap, false, field);
		for (const hop of swap.swapData) {
			assert.equal("inAmountInUSD" in hop, false);
			assert.equal("outAmountInUSD" in hop, false);
		}
	});
});

// Per-hop data from 1.0.29, USD fields removed.
const BASELINE_HOPS = [
	{
		"amm": "Whirlpool",
		"inMint": "So11111111111111111111111111111111111111112",
		"inAmount": "6446183091",
		"inAmountInDecimal": "6.446183091",
		"outMint": "3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG",
		"outAmount": "237260420624",
		"outAmountInDecimal": "237.260420624"
	},
	{
		"amm": "Unknown program TessVdML9pBGgG9yGks7o4HewRaXVAMuoVj4x83GLQH",
		"inMint": "So11111111111111111111111111111111111111112",
		"inAmount": "43139840689",
		"inAmountInDecimal": "43.139840689",
		"outMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		"outAmount": "4305820773",
		"outAmountInDecimal": "4305.820773"
	},
	{
		"amm": "Meteora DLMM",
		"inMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		"inAmount": "1286579246",
		"inAmountInDecimal": "1286.579246",
		"outMint": "3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG",
		"outAmount": "473435952198",
		"outAmountInDecimal": "473.435952198"
	},
	{
		"amm": "Meteora DLMM",
		"inMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		"inAmount": "3019241527",
		"inAmountInDecimal": "3019.241527",
		"outMint": "3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG",
		"outAmount": "1112802651860",
		"outAmountInDecimal": "1112.80265186"
	}
];
