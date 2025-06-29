import React from 'react';

interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface AdvancedChartProps {
  data: ChartDataPoint[];
  type: 'bar' | 'line' | 'pie';
  title: string;
  height?: number;
  className?: string;
}

export function AdvancedChart({ 
  data, 
  type, 
  title, 
  height = 200,
  className = ''
}: AdvancedChartProps) {
  const maxValue = Math.max(...data.map(d => d.value));

  if (type === 'bar') {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <div className="flex items-end space-x-2" style={{ height }}>
          {data.map((item, index) => {
            const barHeight = (item.value / maxValue) * (height - 40);
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className={`w-full rounded-t-sm transition-all duration-300 hover:opacity-80 ${
                    item.color || 'bg-gradient-to-t from-purple-500 to-pink-500'
                  }`}
                  style={{ height: `${barHeight}px` }}
                  title={`${item.label}: ${item.value}`}
                />
                <div className="text-xs text-gray-500 mt-2 text-center">
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (type === 'pie') {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    let currentAngle = 0;

    return (
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <div className="flex items-center justify-center">
          <div className="relative" style={{ width: height, height }}>
            <svg width={height} height={height} className="transform -rotate-90">
              {data.map((item, index) => {
                const percentage = (item.value / total) * 100;
                const angle = (item.value / total) * 360;
                const radius = height / 2 - 10;
                const centerX = height / 2;
                const centerY = height / 2;
                
                const startAngle = currentAngle;
                const endAngle = currentAngle + angle;
                currentAngle += angle;

                const x1 = centerX + radius * Math.cos((startAngle * Math.PI) / 180);
                const y1 = centerY + radius * Math.sin((startAngle * Math.PI) / 180);
                const x2 = centerX + radius * Math.cos((endAngle * Math.PI) / 180);
                const y2 = centerY + radius * Math.sin((endAngle * Math.PI) / 180);

                const largeArcFlag = angle > 180 ? 1 : 0;

                const pathData = [
                  `M ${centerX} ${centerY}`,
                  `L ${x1} ${y1}`,
                  `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                  'Z'
                ].join(' ');

                const colors = [
                  'fill-purple-500',
                  'fill-blue-500',
                  'fill-green-500',
                  'fill-yellow-500',
                  'fill-red-500',
                  'fill-indigo-500'
                ];

                return (
                  <path
                    key={index}
                    d={pathData}
                    className={item.color || colors[index % colors.length]}
                    stroke="white"
                    strokeWidth="2"
                  />
                );
              })}
            </svg>
          </div>
          <div className="ml-6 space-y-2">
            {data.map((item, index) => {
              const percentage = ((item.value / total) * 100).toFixed(1);
              const colors = [
                'bg-purple-500',
                'bg-blue-500',
                'bg-green-500',
                'bg-yellow-500',
                'bg-red-500',
                'bg-indigo-500'
              ];
              
              return (
                <div key={index} className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${colors[index % colors.length]}`} />
                  <span className="text-sm text-gray-600">{item.label}</span>
                  <span className="text-sm font-medium text-gray-900">{percentage}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Line chart (simplified)
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="relative" style={{ height }}>
        <svg width="100%" height={height} className="overflow-visible">
          {data.map((item, index) => {
            if (index === 0) return null;
            
            const prevItem = data[index - 1];
            const x1 = ((index - 1) / (data.length - 1)) * 100;
            const y1 = 100 - ((prevItem.value / maxValue) * 80);
            const x2 = (index / (data.length - 1)) * 100;
            const y2 = 100 - ((item.value / maxValue) * 80);
            
            return (
              <line
                key={index}
                x1={`${x1}%`}
                y1={`${y1}%`}
                x2={`${x2}%`}
                y2={`${y2}%`}
                stroke="url(#gradient)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            );
          })}
          
          {data.map((item, index) => {
            const x = (index / (data.length - 1)) * 100;
            const y = 100 - ((item.value / maxValue) * 80);
            
            return (
              <circle
                key={index}
                cx={`${x}%`}
                cy={`${y}%`}
                r="4"
                fill="white"
                stroke="url(#gradient)"
                strokeWidth="3"
              />
            );
          })}
          
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}