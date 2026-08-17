import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import {
  saveBinanceApiKey,
  getUserBinanceApiKeys,
  getBinanceApiKeyDecrypted,
  deleteBinanceApiKey,
  updateBinanceApiKeySyncTime,
  addAssetToPortfolio,
  getUserPortfolios,
  getCryptocurrencies,
} from "../db";
import { testBinanceApiKeys, getBinanceAccountBalance } from "../services/binanceAccount";

export const binanceImportRouter = router({
  // Save Binance API Keys
  saveApiKeys: protectedProcedure
    .input(
      z.object({
        apiKey: z.string().min(10),
        apiSecret: z.string().min(10),
        label: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Test the API keys first
      const isValid = await testBinanceApiKeys(input.apiKey, input.apiSecret);
      if (!isValid) {
        throw new Error("Invalid Binance API keys. Please check and try again.");
      }

      // Save the keys (encrypted)
      return saveBinanceApiKey(ctx.user.id, input.apiKey, input.apiSecret, input.label);
    }),

  // Get user's Binance API Keys
  getApiKeys: protectedProcedure.query(async ({ ctx }) => {
    return getUserBinanceApiKeys(ctx.user.id);
  }),

  // Delete API Key
  deleteApiKey: protectedProcedure
    .input(z.object({ keyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return deleteBinanceApiKey(input.keyId, ctx.user.id);
    }),

  // Import balances from Binance
  importBalances: protectedProcedure
    .input(
      z.object({
        keyId: z.number(),
        portfolioId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Get the decrypted API keys
        const keys = await getBinanceApiKeyDecrypted(input.keyId, ctx.user.id);

        // Fetch balances from Binance
        const balances = await getBinanceAccountBalance(keys.apiKey, keys.apiSecret);

        // Get all cryptocurrencies from our database
        const cryptos = await getCryptocurrencies();
        const cryptoMap = new Map(cryptos.map((c: any) => [c.symbol, c.id]));

        // Import each balance
        const imported = [];
        for (const balance of balances) {
          const cryptoId = cryptoMap.get(balance.asset);
          if (!cryptoId) continue; // Skip if crypto not in our database

          const totalQuantity = (
            parseFloat(balance.free) + parseFloat(balance.locked)
          ).toString();

          try {
            await addAssetToPortfolio(
              input.portfolioId,
              cryptoId,
              totalQuantity,
              "0", // Current price (will be updated from market data)
              new Date(),
              `Imported from Binance - Free: ${balance.free}, Locked: ${balance.locked}`
            );

            imported.push({
              asset: balance.asset,
              quantity: totalQuantity,
              success: true,
            });
          } catch (error) {
            imported.push({
              asset: balance.asset,
              quantity: totalQuantity,
              success: false,
              error: (error as Error).message,
            });
          }
        }

        // Update last synced time
        await updateBinanceApiKeySyncTime(input.keyId);

        return {
          success: true,
          imported,
          total: imported.length,
        };
      } catch (error) {
        throw new Error(`Failed to import balances: ${(error as Error).message}`);
      }
    }),

  // Get balance preview (without importing)
  previewBalances: protectedProcedure
    .input(z.object({ keyId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const keys = await getBinanceApiKeyDecrypted(input.keyId, ctx.user.id);
        const balances = await getBinanceAccountBalance(keys.apiKey, keys.apiSecret);

        return balances.map((b) => ({
          asset: b.asset,
          free: parseFloat(b.free),
          locked: parseFloat(b.locked),
          total: parseFloat(b.free) + parseFloat(b.locked),
        }));
      } catch (error) {
        throw new Error(`Failed to fetch balances: ${(error as Error).message}`);
      }
    }),
});
