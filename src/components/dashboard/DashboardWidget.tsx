import React from 'react';
import { DivideIcon as LucideIcon } from 'lucide-react';

interface DashboardWidgetProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease';
    period: string;
  };
  icon: LucideIcon;
  color: string;
  children?: React.ReactNode;
  className?: string;
}

export function DashboardWidget({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color, 
  children,
  className = ''
}: DashboardWidgetProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
          {change && (
            <div className={`flex items-center mt-2 text-sm ${
              change.type === 'increase' ? 'text-green-600' : 'text-red-600'
            }`}>
              <span>{change.type === 'increase' ? '+' : '-'}{Math.abs(change.value)}%</span>
              <span className="text-gray-500 ml-1">vs {change.period}</span>
            </div>
          )}
        </div>
        <div className={`w-12 h-12 bg-gradient-to-r ${color} rounded-lg flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      {children}
    </div>
  );
}