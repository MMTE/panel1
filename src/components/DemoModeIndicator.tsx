import React, { useState } from 'react';
import { AlertTriangle, User, Shield, Users, ChevronUp, ChevronDown, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export function DemoModeIndicator() {
  const { isDemoMode, user, switchDemoRole } = useAuth();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  if (!isDemoMode || isHidden) return null;

  const roleIcons = {
    ADMIN: Shield,
    CLIENT: User,
    RESELLER: Users,
  };

  const roleColors = {
    ADMIN: 'from-red-500 to-pink-500',
    CLIENT: 'from-blue-500 to-cyan-500',
    RESELLER: 'from-green-500 to-emerald-500',
  };

  const CurrentRoleIcon = roleIcons[user?.role || 'CLIENT'];

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-3 rounded-full shadow-lg border border-orange-400/50 backdrop-blur-sm hover:from-orange-600 hover:to-red-600 transition-all duration-200 group"
        >
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-semibold">DEMO</span>
            <ChevronUp className="w-3 h-3 group-hover:scale-110 transition-transform" />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs">
      <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg shadow-lg border border-orange-400/50 backdrop-blur-sm">
        {/* Header with controls */}
        <div className="flex items-center justify-between p-3 border-b border-orange-400/30">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-semibold">Demo Mode</span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 rounded hover:bg-white/20 transition-colors"
              title="Minimize"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            <button
              onClick={() => setIsHidden(true)}
              className="p-1 rounded hover:bg-white/20 transition-colors"
              title="Hide"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3">
          <div className="flex items-center space-x-2 mb-3">
            <CurrentRoleIcon className="w-4 h-4" />
            <span className="text-xs">Current Role: {user?.role}</span>
          </div>

          <div className="flex flex-wrap gap-1 mb-3">
            {(['ADMIN', 'CLIENT', 'RESELLER'] as const).map((role) => {
              const Icon = roleIcons[role];
              const isActive = user?.role === role;
              
              return (
                <button
                  key={role}
                  onClick={() => switchDemoRole(role)}
                  className={`px-2 py-1 rounded text-xs flex items-center space-x-1 transition-all ${
                    isActive
                      ? `bg-gradient-to-r ${roleColors[role]} text-white`
                      : 'bg-white/20 hover:bg-white/30 text-white/80'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{role}</span>
                </button>
              );
            })}
          </div>
          
          <div className="text-xs text-orange-100">
            Authentication bypassed for development
          </div>
        </div>
      </div>
    </div>
  );
}