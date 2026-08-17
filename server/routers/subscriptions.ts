import { z } from "zod";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { entitlementCatalog, planConfiguration, subscriptionPlans, type EntitlementKey } from "../entitlements/catalog";
import { entitlementAccountSummary, resolveEntitlement } from "../services/entitlementService";
import { getNexusVoiceProvider } from "../voice/provider";

const entitlementKey = z.enum(Object.keys(entitlementCatalog) as [EntitlementKey, ...EntitlementKey[]]);

export const subscriptionsRouter = router({
  plans: publicProcedure.query(() => ({ plans: planConfiguration, paymentProviderConfigured: false as const, paymentNotice: "Payments are not configured. No charge or checkout is available." })),
  account: protectedProcedure.query(({ ctx }) => entitlementAccountSummary(ctx.user.id)),
  check: protectedProcedure.input(z.object({ featureKey: entitlementKey })).query(async ({ ctx, input }) => ({ decision: await resolveEntitlement(ctx.user.id, input.featureKey), feature: entitlementCatalog[input.featureKey] })),
  upgradePreview: protectedProcedure.input(z.object({ targetPlan: z.enum(subscriptionPlans) })).query(async ({ ctx, input }) => {
    const account = await entitlementAccountSummary(ctx.user.id);
    return { current: account.subscription, targetPlan: input.targetPlan, target: planConfiguration[input.targetPlan], providerState: "NOT_CONFIGURED" as const, canCheckout: false as const, message: "Payments are not configured. This is an informational upgrade preview only." };
  }),
  voiceReadiness: protectedProcedure.query(() => getNexusVoiceProvider().getReadiness()),
  adminAccount: adminProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ input }) => entitlementAccountSummary(input.userId)),
});
