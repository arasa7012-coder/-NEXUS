import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { getCryptocurrencies, getCryptocurrencyBySymbol, insertCryptocurrency } from "./db";
import { analysisRouter } from "./routers/analysis";
import { alertsRouter } from "./routers/alerts";
import { binanceRouter } from "./routers/binance";
import { portfolioRouter } from "./routers/portfolio";
import { binanceImportRouter } from "./routers/binanceImport";
import { notificationsRouter } from "./routers/notifications";
import { portfolioPerformanceRouter } from "./routers/portfolioPerformance";
import { marketDataRouter } from "./routers/marketData";
import { simulationPortfolioRouter } from "./routers/simulationPortfolio";
import { intelligenceRouter } from "./routers/intelligence";
import { riskRouter } from "./routers/risk";
import { strategyLabRouter } from "./routers/strategyLab";
import { copilotRouter } from "./routers/copilot";
import { monitoringRouter } from "./routers/monitoring";
import { nexusCommandRouter } from "./routers/nexusCommand";
import { subscriptionsRouter } from "./routers/subscriptions";
import { onChainRouter } from "./routers/onchain";
import { commodityMarketRouter } from "./routers/commodityMarket";
import { z } from "zod";

export const cryptoRouter = router({
  list: publicProcedure.query(async () => {
    return await getCryptocurrencies();
  }),
  bySymbol: publicProcedure
    .input(z.object({ symbol: z.string() }))
    .query(async (opts) => {
      return await getCryptocurrencyBySymbol(opts.input.symbol);
    }),
  insert: protectedProcedure
    .input(z.object({ symbol: z.string(), name: z.string() }))
    .mutation(async (opts) => {
      await insertCryptocurrency({ symbol: opts.input.symbol, name: opts.input.name });
      return { success: true };
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  crypto: cryptoRouter,
  analysis: analysisRouter,
  alerts: alertsRouter,
  binance: binanceRouter,
  portfolio: portfolioRouter,
  binanceImport: binanceImportRouter,
  notifications: notificationsRouter,
  portfolioPerformance: portfolioPerformanceRouter,
  marketData: marketDataRouter,
  simulationPortfolio: simulationPortfolioRouter,
  intelligence: intelligenceRouter,
  risk: riskRouter,
  strategyLab: strategyLabRouter,
  copilot: copilotRouter,
  monitoring: monitoringRouter,
  nexusCommand: nexusCommandRouter,
  subscriptions: subscriptionsRouter,
  onChain: onChainRouter,
  commodityMarket: commodityMarketRouter,
});

export type AppRouter = typeof appRouter;
