import React from 'react';
import { Activity, Package, FileText, User } from 'lucide-react';

interface ClientNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function ClientNavigation({ activeTab, onTabChange }: ClientNavigationProps) {
  const tabs = [
    { id: 'overview', name: 'Overview', icon: Activity },
    { id: 'subscriptions', name: 'Subscriptions', icon: Package },
    { id: 'invoices', name: 'Invoices', icon: FileText },
    { id: 'profile', name: 'Profile', icon: User }
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8">
      <div className="border-b border-gray-200">
        <nav className="flex space-x-1 sm:space-x-8 px-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center space-x-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}