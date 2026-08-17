import crypto from "crypto";
import axios from "axios";

const BINANCE_API_URL = "https://api.binance.com";

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BinanceAccountInfo {
  balances: BinanceBalance[];
}

export async function getBinanceAccountBalance(
  apiKey: string,
  apiSecret: string
): Promise<BinanceBalance[]> {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;

    // Sign the request
    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(queryString)
      .digest("hex");

    const response = await axios.get<BinanceAccountInfo>(
      `${BINANCE_API_URL}/api/v3/account?${queryString}&signature=${signature}`,
      {
        headers: {
          "X-MBX-APIKEY": apiKey,
        },
      }
    );

    // Filter out zero balances
    return response.data.balances.filter(
      (balance) => parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
    );
  } catch (error) {
    console.error("[Binance Account] Error fetching balance:", error);
    throw new Error("Failed to fetch Binance account balance");
  }
}

export async function testBinanceApiKeys(
  apiKey: string,
  apiSecret: string
): Promise<boolean> {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;

    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(queryString)
      .digest("hex");

    await axios.get(`${BINANCE_API_URL}/api/v3/account?${queryString}&signature=${signature}`, {
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
    });

    return true;
  } catch (error) {
    console.error("[Binance Account] API keys test failed:", error);
    return false;
  }
}
