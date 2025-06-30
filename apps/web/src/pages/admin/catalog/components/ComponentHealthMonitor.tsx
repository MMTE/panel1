import React, { useState, useEffect } from 'react';
import { trpc } from '../../../api/trpc';
import { CheckCircle, AlertCircle, XCircle, Clock, RefreshCw } from 'lucide-react';

interface ComponentHealthMonitorProps {
  componentId: string;
  providerKey: string;
  className?: string;
}

type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

interface HealthData {
  status: HealthStatus;
  message: string;
  lastChecked: string;
  details?: Record<string, any>;
}

export const ComponentHealthMonitor: React.FC<ComponentHealthMonitorProps> = ({
  componentId,
  providerKey,
  className = ''
}) => {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('unknown');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: healthData, refetch, isLoading } = trpc.components.checkHealth.useQuery({
    componentId,
    providerKey
  }, {
    refetchInterval: 30000, // Check every 30 seconds
    onSuccess: (data: HealthData) => {
      setHealthStatus(data.status);
      setLastChecked(new Date(data.lastChecked));
    },
    onError: () => {
      setHealthStatus('down');
      setLastChecked(new Date());
    }
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusIcon = () => {
    const iconClass = "w-4 h-4";
    
    switch (healthStatus) {
      case 'healthy':
        return <CheckCircle className={`${iconClass} text-green-500`} />;
      case 'degraded':
        return <AlertCircle className={`${iconClass} text-yellow-500`} />;
      case 'down':
        return <XCircle className={`${iconClass} text-red-500`} />;
      default:
        return <Clock className={`${iconClass} text-gray-500`} />;
    }
  };

  const getStatusColor = () => {
    switch (healthStatus) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'down':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = () => {
    switch (healthStatus) {
      case 'healthy':
        return 'Healthy';
      case 'degraded':
        return 'Degraded';
      case 'down':
        return 'Down';
      default:
        return 'Unknown';
    }
  };

  const formatLastChecked = () => {
    if (!lastChecked) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - lastChecked.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    
    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else {
      return lastChecked.toLocaleTimeString();
    }
  };

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      {/* Status Indicator */}
      <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor()}`}>
        {getStatusIcon()}
        <span>{getStatusText()}</span>
      </div>

      {/* Last Checked Info */}
      <div className="flex items-center space-x-2 text-xs text-gray-500">
        <span>Last checked: {formatLastChecked()}</span>
        
        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          className="text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh health status"
        >
          <RefreshCw className={`w-3 h-3 ${(isLoading || isRefreshing) ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Health Details Tooltip */}
      {healthData?.details && (
        <div className="relative group">
          <button className="text-gray-400 hover:text-gray-600">
            <AlertCircle className="w-4 h-4" />
          </button>
          
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
            <div className="space-y-1">
              {Object.entries(healthData.details).map(([key, value]) => (
                <div key={key}>
                  <span className="font-medium">{key}:</span> {String(value)}
                </div>
              ))}
            </div>
            
            {/* Arrow */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
};

// Compact version for tables/lists
export const ComponentHealthBadge: React.FC<{
  componentId: string;
  providerKey: string;
}> = ({ componentId, providerKey }) => {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('unknown');

  const { data: healthData } = trpc.components.checkHealth.useQuery({
    componentId,
    providerKey
  }, {
    refetchInterval: 60000, // Check every minute for compact version
    onSuccess: (data: HealthData) => {
      setHealthStatus(data.status);
    },
    onError: () => {
      setHealthStatus('down');
    }
  });

  const getStatusColor = () => {
    switch (healthStatus) {
      case 'healthy':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'down':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} title={`Status: ${healthStatus}`}></div>
      <span className="text-xs text-gray-600 capitalize">{healthStatus}</span>
    </div>
  );
}; 