// pages/dashboard.js
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

      setData(Object.values(dailyData));
    }
    setLoading(false);
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">📊 Ad Performance (7 Days)</h1>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data}>
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="spend" fill="#8884d8" name="Spend ($)" />
            <Bar dataKey="clicks" fill="#82ca9d" name="Clicks" />
            <Bar dataKey="leads" fill="#ffc658" name="Leads" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
