import { WebSocket } from "ws";

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
  volume24h: number;
  change24h: number;
}

export interface CandleUpdate {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * WebSocket connection manager for Binance real-time data
 */
export class BinanceWebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private priceSubscriptions: Map<string, (data: PriceUpdate) => void> =
    new Map();
  private candleSubscriptions: Map<string, (data: CandleUpdate) => void> =
    new Map();

  /**
   * Connect to Binance WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Using Binance public WebSocket (no auth required)
        this.ws = new WebSocket("wss://stream.binance.com:9443/ws");

        this.ws.onopen = () => {
          console.log("[WebSocket] Connected to Binance");
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event: any) => {
          this.handleMessage(event.data as string);
        };

        this.ws.onerror = (error: any) => {
          console.error("[WebSocket] Error:", error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("[WebSocket] Disconnected from Binance");
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Subscribe to price updates for a cryptocurrency
   */
  subscribeToPriceUpdates(
    symbol: string,
    callback: (data: PriceUpdate) => void
  ): void {
    this.priceSubscriptions.set(symbol.toUpperCase(), callback);

    // Subscribe to ticker stream
    const stream = `${symbol.toLowerCase()}usdt@ticker`;
    this.send({
      method: "SUBSCRIBE",
      params: [stream],
      id: 1,
    });
  }

  /**
   * Subscribe to candle updates
   */
  subscribeToCandles(
    symbol: string,
    interval: string,
    callback: (data: CandleUpdate) => void
  ): void {
    this.candleSubscriptions.set(`${symbol}_${interval}`, callback);

    // Subscribe to klines stream
    const stream = `${symbol.toLowerCase()}usdt@klines_${interval}`;
    this.send({
      method: "SUBSCRIBE",
      params: [stream],
      id: 2,
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message: any = JSON.parse(data);

      // Handle ticker updates
      if (message.e === "24hrTicker") {
        const symbol = message.s.replace("USDT", "");
        const callback = this.priceSubscriptions.get(symbol);

        if (callback) {
          callback({
            symbol,
            price: parseFloat(message.c),
            timestamp: message.E,
            volume24h: parseFloat(message.v),
            change24h: parseFloat(message.P),
          });
        }
      }

      // Handle kline (candle) updates
      if (message.e === "kline") {
        const symbol = message.s.replace("USDT", "");
        const kline = message.k;
        const key = `${symbol}_${message.k.i}`;
        const callback = this.candleSubscriptions.get(key);

        if (callback) {
          callback({
            symbol,
            timestamp: kline.t,
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v),
          });
        }
      }
    } catch (error) {
      console.error("[WebSocket] Error parsing message:", error);
    }
  }

  /**
   * Send message to WebSocket
   */
  private send(message: Record<string, any>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `[WebSocket] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error("[WebSocket] Reconnection failed:", error);
        });
      }, this.reconnectDelay);
    } else {
      console.error("[WebSocket] Max reconnection attempts reached");
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.priceSubscriptions.clear();
    this.candleSubscriptions.clear();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let instance: BinanceWebSocketManager | null = null;

export function getBinanceWebSocketManager(): BinanceWebSocketManager {
  if (!instance) {
    instance = new BinanceWebSocketManager();
  }
  return instance;
}
