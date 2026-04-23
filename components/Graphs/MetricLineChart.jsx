import React, { useMemo } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

Chart.register(
  BarElement,
  CategoryScale,
  Legend,
  LinearScale,
  Tooltip
);

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function MetricLineChart({ label, value, borderColor, backgroundColor }) {
  const currentValue = useMemo(() => toNumber(value), [value]);

  return (
    <section aria-label={`${label} snapshot`}>
      <div>
        <h3>{label}</h3>
        <span>current sample</span>
      </div>
      <Bar
        data={{
          labels: ['current'],
          datasets: [
            {
              label,
              data: [currentValue],
              backgroundColor,
              borderColor,
              borderWidth: 2,
              borderRadius: 6,
            },
          ],
        }}
        options={{
          animation: false,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              intersect: false,
              mode: 'index',
            },
          },
          responsive: true,
          scales: {
            x: {
              grid: {
                display: false,
              },
            },
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0,
              },
            },
          },
        }}
      />
    </section>
  );
}

export default React.memo(MetricLineChart);
