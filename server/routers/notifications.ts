import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
} from "../services/notificationService";

export const notificationsRouter = router({
  // Get all notifications for user
  getNotifications: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return getUserNotifications(ctx.user.id, input?.limit || 50);
    }),

  // Get unread count
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    return getUnreadCount(ctx.user.id);
  }),

  // Mark notification as read
  markAsRead: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ input }) => {
      return markNotificationAsRead(input.notificationId);
    }),

  // Mark all as read
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    return markAllAsRead(ctx.user.id);
  }),

  // Delete notification
  deleteNotification: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ input }) => {
      return deleteNotification(input.notificationId);
    }),

  // Create test notification
  createTestNotification: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        message: z.string(),
        type: z.enum(["price_alert", "portfolio_update", "trade_signal", "system"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return createNotification({
        userId: ctx.user.id,
        title: input.title,
        message: input.message,
        type: input.type,
      });
    }),
});
