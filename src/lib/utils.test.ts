import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPriceInUSDByMint } from "./utils";

// The price cache is module-level, so every test uses its own mint.
const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

type FetchCall = { url: string; init?: RequestInit };

function stubFetch(respond: (url: string) => Promise<Response>): FetchCall[] {
	const calls: FetchCall[] = [];
	globalThis.fetch = (async (input: any, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, init });
		return respond(url);
	}) as typeof fetch;
	return calls;
}

const json = (body: unknown, status = 200) =>
	Promise.resolve(
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		}),
	);

describe("getPriceInUSDByMint", () => {
	it("returns the Jupiter usdPrice for the mint", async () => {
		const calls = stubFetch(() => json({ MintA: { usdPrice: 1.25 } }));
		const price = await getPriceInUSDByMint("MintA");
		assert.equal(price?.toString(), "1.25");
		assert.equal(calls.length, 1);
		assert.match(calls[0].url, /lite-api\.jup\.ag\/price\/v3\?ids=MintA$/);
	});

	it("bounds every request with an abort signal, so a hung API cannot stall a parse", async () => {
		const calls = stubFetch(() => json({ MintB: { usdPrice: 2 } }));
		await getPriceInUSDByMint("MintB");
		assert.ok(calls[0].init?.signal instanceof AbortSignal);
	});

	it("serves a repeat lookup from the 60s cache without a request", async () => {
		const calls = stubFetch(() => json({ MintC: { usdPrice: 3 } }));
		await getPriceInUSDByMint("MintC");
		const again = await getPriceInUSDByMint("MintC");
		assert.equal(again?.toString(), "3");
		assert.equal(calls.length, 1);
	});

	it("returns undefined for a non-2xx response (e.g. rate limited)", async () => {
		stubFetch(() => json({ error: "rate limited" }, 429));
		assert.equal(await getPriceInUSDByMint("MintD"), undefined);
	});

	it("returns undefined when the request fails outright", async () => {
		stubFetch(() => Promise.reject(new TypeError("fetch failed")));
		assert.equal(await getPriceInUSDByMint("MintE"), undefined);
	});

	it("returns undefined when Jupiter has no price for the mint", async () => {
		stubFetch(() => json({}));
		assert.equal(await getPriceInUSDByMint("MintF"), undefined);
	});

	it("returns undefined for a body that is not JSON", async () => {
		stubFetch(() => Promise.resolve(new Response("<html>oops</html>")));
		assert.equal(await getPriceInUSDByMint("MintG"), undefined);
	});

	// The production crash: got v11 fired a retry from a timer after the call
	// had already settled, and threw where nothing could catch it. A failed
	// lookup must leave nothing behind that can run later.
	it("leaves no timer running after a failed lookup", async () => {
		stubFetch(() => json({}, 500));
		const before = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
		await getPriceInUSDByMint("MintH");
		const after = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
		assert.ok(after <= before, `timers before=${before} after=${after}`);
	});
});
