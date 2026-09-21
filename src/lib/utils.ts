import Decimal from "decimal.js";
import { BN } from "@coral-xyz/anchor";

export class DecimalUtil {
	public static fromBigInt(input: BigInt, shift = 0): Decimal {
		return new Decimal(input.toString()).div(new Decimal(10).pow(shift));
	}

	public static fromBN(input: BN, shift = 0): Decimal {
		return new Decimal(input.toString()).div(new Decimal(10).pow(shift));
	}
}
