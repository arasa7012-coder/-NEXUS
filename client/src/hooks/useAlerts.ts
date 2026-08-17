import { useState, useCallback } from "react";
import { toast } from "sonner";

export interface Alert {
  id: number;
  cryptoId: number;
  type: "price_level" | "ta_signal" | "ai_signal";
  condition: string;
  isActive: number;
  triggeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UseAlertsReturn {
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  createAlert: (cryptoId: number, type: Alert["type"], condition: string) => Promise<void>;
  updateAlert: (alertId: number, isActive: number, condition?: string) => Promise<void>;
  deleteAlert: (alertId: number) => Promise<void>;
  triggerAlert: (alert: Alert) => void;
}

/**
 * Hook to manage cryptocurrency alerts and notifications
 */
export function useAlerts(): UseAlertsReturn {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createAlert = useCallback(
    async (cryptoId: number, type: Alert["type"], condition: string) => {
      try {
        setLoading(true);
        // Mock implementation - will be replaced with real API call
        const newAlert: Alert = {
          id: Math.random(),
          cryptoId,
          type,
          condition,
          isActive: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setAlerts((prev) => [...prev, newAlert]);
        toast.success("Alert created successfully");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create alert";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateAlert = useCallback(
    async (alertId: number, isActive: number, condition?: string) => {
      try {
        setLoading(true);
        setAlerts((prev) =>
          prev.map((alert) =>
            alert.id === alertId
              ? {
                  ...alert,
                  isActive,
                  condition: condition || alert.condition,
                  updatedAt: new Date(),
                }
              : alert
          )
        );
        toast.success("Alert updated successfully");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update alert";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteAlert = useCallback(async (alertId: number) => {
    try {
      setLoading(true);
      setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
      toast.success("Alert deleted successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete alert";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerAlert = useCallback((alert: Alert) => {
    toast.warning(`Alert triggered: ${alert.condition}`, {
      description: `${alert.type.toUpperCase()} alert for crypto ${alert.cryptoId}`,
      duration: 5000,
    });
  }, []);

  return {
    alerts,
    loading,
    error,
    createAlert,
    updateAlert,
    deleteAlert,
    triggerAlert,
  };
}
