import axios from "axios";
import crypto from "crypto";

export type ExchangeType = "binance" | "coinbase" | "okx" | "kraken" | "bybit";

export interface ExchangeBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface ExchangeConfig {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

// Binance API Implementation
export async function getBinanceBalances(config: ExchangeConfig): Promise<ExchangeBalance[]> {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;

  const signature = crypto
    .createHmac("sha256", config.apiSecret)
    .update(queryString)
    .digest("hex");

  try {
    const response = await axios.get("https://api.binance.com/api/v3/account", {
      params: {
        timestamp,
        signature,
      },
      headers: {
        "X-MBX-APIKEY": config.apiKey,
      },
    });

    return response.data.balances
      .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b: any) => ({
        asset: b.asset,
        free: parseFloat(b.free),
        locked: parseFloat(b.locked),
        total: parseFloat(b.free) + parseFloat(b.locked),
      }));
  } catch (error) {
    throw new Error(`Binance API error: ${(error as Error).message}`);
  }
}

// Coinbase API Implementation
export async function getCoinbaseBalances(config: ExchangeConfig): Promise<ExchangeBalance[]> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = "GET";
  const requestPath = "/api/v3/brokerage/accounts";
  const body = "";

  const message = timestamp + method + requestPath + body;
  const signature = crypto
    .createHmac("sha256", config.apiSecret)
    .update(message)
    .digest("base64");

  try {
    const response = await axios.get("https://api.coinbase.com/api/v3/brokerage/accounts", {
      headers: {
        "CB-ACCESS-KEY": config.apiKey,
        "CB-ACCESS-SIGN": signature,
        "CB-ACCESS-TIMESTAMP": timestamp,
      },
    });

    return response.data.accounts
      .filter((a: any) => parseFloat(a.available_balance.value) > 0)
      .map((a: any) => ({
        asset: a.currency.symbol,
        free: parseFloat(a.available_balance.value),
        locked: 0,
        total: parseFloat(a.available_balance.value),
      }));
  } catch (error) {
    throw new Error(`Coinbase API error: ${(error as Error).message}`);
  }
}

// OKX API Implementation
export async function getOKXBalances(config: ExchangeConfig): Promise<ExchangeBalance[]> {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/account/balance";
  const body = "";

  const message = timestamp + method + requestPath + body;
  const signature = crypto
    .createHmac("sha256", config.apiSecret)
    .update(message)
    .digest("base64");

  try {
    const response = await axios.get("https://www.okx.com/api/v5/account/balance", {
      headers: {
        "OK-ACCESS-KEY": config.apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": config.passphrase,
      },
    });

    if (response.data.code !== "0") {
      throw new Error(response.data.msg);
    }

    return response.data.data[0].details
      .filter((d: any) => parseFloat(d.availBal) > 0)
      .map((d: any) => ({
        asset: d.ccy,
        free: parseFloat(d.availBal),
        locked: parseFloat(d.frozenBal),
        total: parseFloat(d.availBal) + parseFloat(d.frozenBal),
      }));
  } catch (error) {
    throw new Error(`OKX API error: ${(error as Error).message}`);
  }
}

// Kraken API Implementation
export async function getKrakenBalances(config: ExchangeConfig): Promise<ExchangeBalance[]> {
  const nonce = Date.now().toString();
  const postdata = `nonce=${nonce}`;

  const message = postdata;
  const signature = crypto
    .createHmac("sha512", config.apiSecret)
    .update(message)
    .digest("base64");

  try {
    const response = await axios.post("https://api.kraken.com/0/private/Balance", postdata, {
      headers: {
        "API-Sign": signature,
        "API-Key": config.apiKey,
      },
    });

    if (response.data.error.length > 0) {
      throw new Error(response.data.error[0]);
    }

    return Object.entries(response.data.result)
      .filter(([_, balance]: [string, any]) => parseFloat(balance) > 0)
      .map(([asset, balance]: [string, any]) => ({
        asset: asset.replace(/^X/, "").replace(/^Z/, ""),
        free: parseFloat(balance),
        locked: 0,
        total: parseFloat(balance),
      }));
  } catch (error) {
    throw new Error(`Kraken API error: ${(error as Error).message}`);
  }
}

// Bybit API Implementation
export async function getBybitBalances(config: ExchangeConfig): Promise<ExchangeBalance[]> {
  const timestamp = Date.now().toString();
  const params = `timestamp=${timestamp}`;

  const signature = crypto
    .createHmac("sha256", config.apiSecret)
    .update(params)
    .digest("hex");

  try {
    const response = await axios.get("https://api.bybit.com/v5/account/wallet-balance", {
      params: {
        timestamp,
        sign: signature,
      },
      headers: {
        "X-BAPI-KEY": config.apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-SIGN": signature,
      },
    });

    if (response.data.retCode !== 0) {
      throw new Error(response.data.retMsg);
    }

    const balances: ExchangeBalance[] = [];
    response.data.result.list.forEach((account: any) => {
      account.coin.forEach((coin: any) => {
        if (parseFloat(coin.walletBalance) > 0) {
          balances.push({
            asset: coin.coin,
            free: parseFloat(coin.availableToWithdraw),
            locked: parseFloat(coin.walletBalance) - parseFloat(coin.availableToWithdraw),
            total: parseFloat(coin.walletBalance),
          });
        }
      });
    });

    return balances;
  } catch (error) {
    throw new Error(`Bybit API error: ${(error as Error).message}`);
  }
}

// Main function to get balances from any exchange
export async function getExchangeBalances(
  exchange: ExchangeType,
  config: ExchangeConfig
): Promise<ExchangeBalance[]> {
  switch (exchange) {
    case "binance":
      return getBinanceBalances(config);
    case "coinbase":
      return getCoinbaseBalances(config);
    case "okx":
      return getOKXBalances(config);
    case "kraken":
      return getKrakenBalances(config);
    case "bybit":
      return getBybitBalances(config);
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
}

// Test API connection
export async function testExchangeConnection(
  exchange: ExchangeType,
  config: ExchangeConfig
): Promise<boolean> {
  try {
    const balances = await getExchangeBalances(exchange, config);
    return balances.length >= 0;
  } catch (error) {
    return false;
  }
}
