import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useBinanceCandles } from '@/hooks/useBinanceData';
import { Loader2 } from 'lucide-react';

interface RealTimeChartProps {
  symbol: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  limit?: number;
}

/**
 * Real-time chart component with live Binance data
 */
export default function RealTimeChart({
  symbol,
  interval = '1h',
  limit = 100,
}: RealTimeChartProps) {
  const { candles, isLoading, error } = useBinanceCandles(symbol, interval, limit);

  // Transform candles data for Recharts
  const chartData = useMemo(() => {
    return candles.map((candle) => ({
      time: new Date(candle.openTime).toLocaleTimeString('ar-SA'),
      timeMs: candle.openTime,
      open: Math.round(candle.open * 100) / 100,
      high: Math.round(candle.high * 100) / 100,
      low: Math.round(candle.low * 100) / 100,
      close: Math.round(candle.close * 100) / 100,
      volume: Math.round(candle.volume),
      quoteVolume: Math.round(candle.quoteAssetVolume),
    }));
  }, [candles]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return { high: 0, low: 0, current: 0, volume: 0, change: 0 };
    }

    const closes = chartData.map((d) => d.close);
    const highs = chartData.map((d) => d.high);
    const lows = chartData.map((d) => d.low);
    const volumes = chartData.map((d) => d.volume);

    const current = closes[closes.length - 1];
    const previous = closes[0];
    const change = ((current - previous) / previous) * 100;

    return {
      high: Math.max(...highs),
      low: Math.min(...lows),
      current,
      volume: volumes.reduce((a, b) => a + b, 0),
      change,
    };
  }, [chartData]);

  if (error) {
    return (
      <div className="w-full h-96 bg-gray-900 border-2 border-white p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 font-bold text-lg">❌ خطأ في جلب البيانات</p>
          <p className="text-gray-400 text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading || chartData.length === 0) {
    return (
      <div className="w-full h-96 bg-gray-900 border-2 border-white p-4 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-2 text-red-600" size={32} />
          <p className="text-white font-bold">جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-gray-900 border-2 border-white p-4">
      {/* Header */}
      <div className="mb-4 pb-4 border-b-2 border-red-600">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-3xl font-black text-white">
              📊 {symbol}/USDT
            </h3>
            <p className="text-gray-400 text-sm mt-1">
              الفترة: {interval.toUpperCase()} | آخر تحديث: {new Date().toLocaleTimeString('ar-SA')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-black text-white">
              ${stats.current.toFixed(2)}
            </p>
            <p
              className={`text-xl font-black ${
                stats.change >= 0 ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {stats.change >= 0 ? '📈' : '📉'} {stats.change.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="time"
            stroke="#999"
            tick={{ fill: '#999', fontSize: 11 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            stroke="#999"
            tick={{ fill: '#999', fontSize: 11 }}
            domain={['dataMin - 10', 'dataMax + 10']}
            yAxisId="left"
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#999"
            tick={{ fill: '#999', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#000',
              border: '2px solid #fff',
              borderRadius: 0,
              padding: '10px',
            }}
            labelStyle={{ color: '#fff' }}
            formatter={(value: any) => {
              if (typeof value === 'number') {
                return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
              }
              return value;
            }}
            labelFormatter={(label) => `الوقت: ${label}`}
          />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="square"
          />

          {/* Volume bars */}
          <Bar
            yAxisId="right"
            dataKey="volume"
            fill="#ff000044"
            name="الحجم"
            radius={0}
          />

          {/* Close price line */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="close"
            stroke="#fff"
            dot={false}
            strokeWidth={2}
            name="السعر الإغلاق"
            isAnimationActive={false}
          />

          {/* High price line */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="high"
            stroke="#22c55e"
            dot={false}
            strokeWidth={1}
            strokeDasharray="5 5"
            name="أعلى سعر"
            isAnimationActive={false}
          />

          {/* Low price line */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="low"
            stroke="#ef4444"
            dot={false}
            strokeWidth={1}
            strokeDasharray="5 5"
            name="أقل سعر"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-4 border-t-2 border-red-600">
        <div className="bg-gray-800 border-2 border-white p-4">
          <p className="text-gray-400 text-xs font-bold uppercase">أعلى سعر</p>
          <p className="text-white text-2xl font-black mt-2">
            ${stats.high.toFixed(2)}
          </p>
        </div>
        <div className="bg-gray-800 border-2 border-white p-4">
          <p className="text-gray-400 text-xs font-bold uppercase">أقل سعر</p>
          <p className="text-white text-2xl font-black mt-2">
            ${stats.low.toFixed(2)}
          </p>
        </div>
        <div className="bg-gray-800 border-2 border-white p-4">
          <p className="text-gray-400 text-xs font-bold uppercase">النطاق</p>
          <p className="text-white text-2xl font-black mt-2">
            ${(stats.high - stats.low).toFixed(2)}
          </p>
        </div>
        <div className="bg-gray-800 border-2 border-white p-4">
          <p className="text-gray-400 text-xs font-bold uppercase">الحجم الكلي</p>
          <p className="text-white text-2xl font-black mt-2">
            {(stats.volume / 1e6).toFixed(1)}M
          </p>
        </div>
      </div>
    </div>
  );
}
