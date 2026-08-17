import { AlchemyProvider } from "./alchemyProvider";
import type { OnChainProvider } from "./types";

/** Core services depend on this contract, not a provider SDK or API URL. */
export const primaryOnChainProvider: OnChainProvider = new AlchemyProvider();
