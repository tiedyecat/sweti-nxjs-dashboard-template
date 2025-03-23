x// pages/dashboard.js
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid
} from 'recharts';

// Supabase client (frontend-safe variables)
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
    const { data, error } = await supabase
      .from('ad_insights')
      .select('date_start, spend, clicks, leads')
      .gte('date_start', '2025-01-01') // Only fetch data from 2025 onwards
      .order('date_start', { ascending: true });

    if (error) {
      console.error('Supabase Error:', error);
    } else {
      const dailyData = {};

      data.forEach(({ date_start, spend, clicks, leads }) => {
        if (!dailyData[date_start]) {
          dailyData[date_start] = { date: date_start, spend: 0, clicks: 0, leads: 0 };
        }
        dailyData[date_start].spend += parseFloat(spend);
        dailyData[date_start].clicks += parseInt(clicks);
        dailyData[date_start].leads += parseInt(leads);
      });

      // Round spend to two decimal places for clean display
      const chartData = Object.values(dailyData).map(item => ({
        ...item,
        spend: parseFloat(item.spend.toFixed(2)),
      }));

      setData(chartData);
    }
    setLoading(false);
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">
        📊 Ad Performance (Last 7 Days)
      </h1>

      {loading ? (
        <div className="text-gray-500">Loading your data...</div>
      ) : (
        <ResponsiveContainer width="100%" height={450}>
          <BarChart
            data={data}
            margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 12 }} />
            <YAxis stroke="#888" tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend verticalAlign="top" />
            <Bar dataKey="spend" fill="#4f46e5" name="Spend ($)" />
            <Bar dataKey="clicks" fill="#10b981" name="Clicks" />
            <Bar dataKey="leads" fill="#f59e0b" name="Leads" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

