import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import {
  calculateAllIndicators,
  Candle,
  generateTradingSignal,
} from "../services/technicalAnalysis";
import { generateAIAnalysis, generateForecast, analyzeSentiment } from "../services/aiAnalysis";

export const analysisRouter = router({
  // Calculate technical indicators for a given set of candles
  technicalIndicators: publicProcedure
    .input(
      z.object({
        candles: z.array(
          z.object({
            timestamp: z.number(),
            open: z.number(),
            high: z.number(),
            low: z.number(),
            close: z.number(),
            volume: z.number(),
          })
        ),
      })
    )
    .query(({ input }) => {
      const candles: Candle[] = input.candles;
      if (candles.length === 0) {
        return {
          rsi: 50,
          macd: { macd: 0, signal: 0, histogram: 0 },
          bollingerBands: { upper: 0, middle: 0, lower: 0 },
          ema20: 0,
          ema50: 0,
        };
      }

      return calculateAllIndicators(candles);
    }),

  // Generate trading signal based on technical indicators
  tradingSignal: publicProcedure
    .input(
      z.object({
        rsi: z.number(),
        macd: z.object({
          macd: z.number(),
          signal: z.number(),
          histogram: z.number(),
        }),
        bollingerBands: z.object({
          upper: z.number(),
          middle: z.number(),
          lower: z.number(),
        }),
        ema20: z.number(),
        ema50: z.number(),
      })
    )
    .query(({ input }) => {
      return generateTradingSignal(input);
    }),

  // DETERMINISTIC, NOT AI.
  // `services/aiAnalysis.ts` is self-documented as a mock implementation:
  // sentiment is keyword counting and the "analysis" is fixed threshold logic.
  // No model is invoked. The procedure name is retained for compatibility, but
  // every response carries `analysisMethod: "DETERMINISTIC_RULES"` so no caller
  // can present this as model output. Real model-backed analysis lives in
  // services/copilotService.ts, which is evidence-grounded and cites sources.
  //
  // This router currently has NO client caller (verified repo-wide). It is left
  // registered rather than deleted because removing a public procedure is a
  // product/API-compatibility decision, not a mechanical cleanup.
  aiAnalysis: publicProcedure
    .input(
      z.object({
        indicators: z.object({
          rsi: z.number(),
          macd: z.object({
            macd: z.number(),
            signal: z.number(),
            histogram: z.number(),
          }),
          bollingerBands: z.object({
            upper: z.number(),
            middle: z.number(),
            lower: z.number(),
          }),
          ema20: z.number(),
          ema50: z.number(),
        }),
        currentPrice: z.number(),
        sentiment: z.number().optional().default(0),
        recentPrices: z.array(z.number()).optional().default([]),
      })
    )
    .query(({ input }) => {
      return generateAIAnalysis(
        input.indicators,
        input.currentPrice,
        input.sentiment,
        input.recentPrices
      );
    }),

  // Generate market forecast
  forecast: publicProcedure
    .input(
      z.object({
        recentPrices: z.array(z.number()),
        indicators: z.object({
          rsi: z.number(),
          macd: z.object({
            macd: z.number(),
            signal: z.number(),
            histogram: z.number(),
          }),
          bollingerBands: z.object({
            upper: z.number(),
            middle: z.number(),
            lower: z.number(),
          }),
          ema20: z.number(),
          ema50: z.number(),
        }),
      })
    )
    .query(({ input }) => {
      return generateForecast(input.recentPrices, input.indicators);
    }),

  // Analyze sentiment from news headlines
  sentiment: publicProcedure
    .input(
      z.object({
        headlines: z.array(z.string()),
      })
    )
    .query(({ input }) => {
      const sentiment = analyzeSentiment(input.headlines);
      return {
        score: sentiment,
        label:
          sentiment > 0.5
            ? "VERY_POSITIVE"
            : sentiment > 0.2
              ? "POSITIVE"
              : sentiment < -0.5
                ? "VERY_NEGATIVE"
                : sentiment < -0.2
                  ? "NEGATIVE"
                  : "NEUTRAL",
      };
    }),
});
