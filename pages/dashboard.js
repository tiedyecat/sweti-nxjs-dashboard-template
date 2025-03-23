// pages/dashboard.js
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: fetchedData, error } = await supabase
      .from('ad_insights')
      .select('date_start, spend, clicks, leads');

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const dailyData = {};

    fetchedData.forEach(({ date_start, spend, clicks, leads }) => {
      if (!dailyData[date_start]) {
        dailyData[date_start] = { date: date_start, spend: 0, clicks: 0, leads: 0 };
      }
      dailyData[date_start].spend += parseFloat(spend);
      dailyData[date_start].clicks += clicks;
      dailyData[date_start].leads += leads;
    });

    const chartData = Object.values(dailyData).map((item) => ({
      date: item.date,
      spend: parseFloat(item.spend.toFixed(2)),
      clicks: item.clicks,
      leads: item.leads,
    }));

    setData(chartData);
    setLoading(false);
  }

  return (
    <div className="bg-gray-900 min-h-screen text-white">
      <div className="container mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <img src="/logo-sweti.png" alt="SWETI Marketing" className="h-16 w-auto" />
          <img src="/logo-physiq.png" alt="Physiq Fitness" className="h-12 w-auto" />
        </div>

        <h1 className="text-3xl font-bold mb-6" style={{ color: '#97c848' }}>
          📊 Physiq Fitness Ad Performance (7 Days)
        </h1>

        {loading ? (
          <div className="text-gray-400">Loading your data...</div>
        ) : (
          <BarChart
            width={800}
            height={400}
            data={data}
            margin={{ top: 20, right: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
            <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', borderRadius: '8px' }}
              labelStyle={{ color: '#ffffff' }}
            />
            <Legend />
            <Bar dataKey="spend" fill="#167cff" name="Spend ($)" />
            <Bar dataKey="clicks" fill="#97c848" name="Clicks" />
            <Bar dataKey="leads" fill="#ffffff" name="Leads" />
          </BarChart>
        )}
      </div>
    </div>
  );
}
