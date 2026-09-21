import Decimal from "decimal.js";
import { BN } from "@coral-xyz/anchor";

// Caches for Price API
const jupiterPrices: Map<string, any> = new Map();
const jupiterTTL: Map<string, number> = new Map();

/**
 * A price is optional (callers leave the USD amount undefined without one),
 * so a slow Jupiter API must never hold up a parse.
 */
const PRICE_TIMEOUT_MS = 2_000;

// Use the Jupiter Pricing API to get the price of a token in USD.
export async function getPriceInUSDByMint(
	tokenMint: string
): Promise<Decimal | undefined> {
	try {
		let price = jupiterPrices.get(tokenMint);
		let ttl = jupiterTTL.get(tokenMint);

		// Cache for 60 seconds
		if (price && ttl && new Date().getTime() - ttl < 60 * 1000) {
			return new Decimal(price);
		}

		// Native fetch, no retries. got v11 retried from a timer that could fire
		// after this call had already settled; the retry then threw where no
		// caller could catch it, and took the whole process down.
		const response = await fetch(
			`https://lite-api.jup.ag/price/v3?ids=${tokenMint}`,
			{ signal: AbortSignal.timeout(PRICE_TIMEOUT_MS) },
		);
		if (!response.ok) {
			throw new Error(`Jupiter price API returned ${response.status}`);
		}
		let payload = (await response.json()) as any;

		if (payload[tokenMint]) {
			let price = payload[tokenMint].usdPrice;

			jupiterPrices.set(tokenMint, price);
			jupiterTTL.set(tokenMint, new Date().getTime());

			return new Decimal(price);
		}
	} catch (e) {
		console.log(`coin not found: ${tokenMint}`);
		return;
	}

	return;
}

export class DecimalUtil {
	public static fromBigInt(input: BigInt, shift = 0): Decimal {
		return new Decimal(input.toString()).div(new Decimal(10).pow(shift));
	}

	public static fromBN(input: BN, shift = 0): Decimal {
		return new Decimal(input.toString()).div(new Decimal(10).pow(shift));
	}
}
