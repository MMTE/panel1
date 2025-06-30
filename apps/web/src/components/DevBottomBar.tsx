import React, { useState, useEffect } from 'react';
import { 
  User, 
  Shield, 
  Users, 
  Settings, 
  ChevronUp, 
  ChevronDown, 
  X,
  Eye,
  EyeOff,
  RefreshCw,
  Database,
  Loader2
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../api/trpc';
import { usePermissions } from '../hooks/usePermissions';

interface UserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'ADMIN' | 'CLIENT' | 'RESELLER';
  tenantId: string | null;
  isActive: boolean;
  createdAt: Date;
}

// NOTE: This component is for development only and uses RBAC system for permissions

// Fallback mock profiles for when database is not available
const FALLBACK_PROFILES = [
  {
    id: 'admin-dev-1',
    email: 'admin@panel1.dev',
    firstName: 'Alex',
    lastName: 'Administrator',
    role: 'ADMIN',
    tenantId: 'demo-tenant-id',
    isActive: true,
    createdAt: new Date(),
  },
  {
    id: 'client-dev-1',
    email: 'client@panel1.dev',
    firstName: 'John',
    lastName: 'Customer',
    role: 'CLIENT',
    tenantId: 'demo-tenant-id',
    isActive: true,
    createdAt: new Date(),
  },
  {
    id: 'reseller-dev-1',
    email: 'reseller@panel1.dev',
    firstName: 'Bob',
    lastName: 'Reseller',
    role: 'RESELLER',
    tenantId: 'demo-tenant-id',
    isActive: true,
    createdAt: new Date(),
  },
];

export function DevBottomBar() {
  const { user, switchDemoRole, switchDemoProfile, impersonateUser } = useAuth();
  const { userPermissions, loading: permissionsLoading } = usePermissions();
  const [isVisible, setIsVisible] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(() => {
    // Load persisted profile from localStorage
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('dev-selected-profile');
        return saved ? JSON.parse(saved) : null;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [useRealUsers, setUseRealUsers] = useState(true);

  // Fetch real users from database (dev-only endpoint)
  const { data: realUsersData, isLoading: loadingUsers, error: usersError, refetch } = trpc.users.devGetAll.useQuery(
    undefined, 
    { 
      enabled: useRealUsers && import.meta.env.DEV,
      retry: 1,
      onError: (error) => {
        console.warn('Failed to fetch real users, falling back to mock data:', error);
        setUseRealUsers(false);
      }
    }
  );

  // Only show in development mode
  const isDev = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';
  
  // Get profiles (real users or fallback)
  const profiles = useRealUsers && realUsersData?.users ? realUsersData.users : FALLBACK_PROFILES;
  
  // Auto-switch to persisted profile on mount (only once)
  useEffect(() => {
    const loadSavedProfile = async () => {
      if (!selectedProfile || user || loadingUsers) return;

      console.log(`🔄 Auto-loading saved profile: ${selectedProfile.firstName} ${selectedProfile.lastName}`);
      try {
        if (useRealUsers && realUsersData?.users?.some(u => u.id === selectedProfile.id)) {
          await impersonateUser(selectedProfile.id);
        } else {
          await switchDemoProfile(selectedProfile);
        }
      } catch (error) {
        console.warn('Failed to load saved profile:', error);
        // Clear the saved profile to prevent infinite retry
        if (typeof window !== 'undefined') {
          localStorage.removeItem('dev-selected-profile');
          setSelectedProfile(null);
        }
      }
    };

    loadSavedProfile();
  }, [selectedProfile, user, loadingUsers, realUsersData]);
  
  if (!isDev || !isVisible) return null;

  const roleIcons = {
    ADMIN: Shield,
    CLIENT: User,
    RESELLER: Users,
  };

  const roleColors = {
    ADMIN: 'bg-gradient-to-r from-red-500 to-pink-500',
    CLIENT: 'bg-gradient-to-r from-blue-500 to-cyan-500',
    RESELLER: 'bg-gradient-to-r from-green-500 to-emerald-500',
  };

  const currentProfile = selectedProfile || profiles.find(p => p.role === user?.role) || profiles[0];
  const CurrentRoleIcon = roleIcons[currentProfile.role];

  const switchToProfile = async (profile: UserProfile) => {
    if (!profile || !profile.id) {
      console.error('Invalid profile for demo switch:', profile);
      return;
    }

    setSelectedProfile(profile);
    
    try {
      if (useRealUsers) {
        await impersonateUser(profile.id);
        console.log(`✅ Successfully impersonated real user: ${profile.firstName} ${profile.lastName}`);
      } else {
        await switchDemoProfile(profile);
      }

      // Only persist the profile if the switch was successful
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('dev-selected-profile', JSON.stringify(profile));
          window.dispatchEvent(new CustomEvent('dev-profile-switch', { 
            detail: profile 
          }));
        } catch (error) {
          console.warn('Failed to persist dev profile:', error);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to switch to profile ${profile.firstName}:`, error);
      // Clear the selected profile on error to prevent infinite loops
      setSelectedProfile(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('dev-selected-profile');
      }
    }
  };

  if (!isExpanded) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-2 duration-300">
        <div className="bg-slate-800/95 backdrop-blur-sm border-t border-slate-700/50 shadow-lg">
          <div className="max-w-screen-xl mx-auto px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-slate-400 font-medium">DEV MODE</span>
                </div>
                
                <div className="h-4 w-px bg-slate-600"></div>
                
                <div className="flex items-center space-x-2">
                  <div className={`w-6 h-6 rounded-full ${roleColors[currentProfile.role]} flex items-center justify-center`}>
                    <CurrentRoleIcon className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-sm text-white font-medium">
                    {currentProfile.firstName || 'Unknown'} {currentProfile.lastName || 'User'}
                  </span>
                  <span className="text-xs text-slate-400">({currentProfile.role})</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsExpanded(true)}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white transition-colors flex items-center space-x-1"
                >
                  <Settings className="w-3 h-3" />
                  <span>Switch Profile</span>
                  <ChevronUp className="w-3 h-3" />
                </button>
                
                <button
                  onClick={() => setIsVisible(false)}
                  className="p-1 hover:bg-slate-700 rounded transition-colors"
                  title="Hide dev bar"
                >
                  <EyeOff className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-800/95 backdrop-blur-sm border-t border-slate-700/50 shadow-lg">
        <div className="max-w-screen-xl mx-auto px-4 py-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <h3 className="text-sm font-semibold text-white">Development Profile Switcher</h3>
                  {loadingUsers && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                  <button
                    onClick={() => {
                      const newMode = !useRealUsers;
                      setUseRealUsers(newMode);
                      console.log(`🔄 Switched to ${newMode ? 'real database' : 'mock'} users`);
                    }}
                    className={`px-2 py-1 rounded text-xs transition-colors flex items-center space-x-1 ${
                      useRealUsers 
                        ? 'bg-blue-600 text-white hover:bg-blue-700' 
                        : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                    }`}
                    title={useRealUsers ? 'Using real database users - click to switch to mock' : 'Using mock users - click to switch to database'}
                  >
                    <Database className="w-3 h-3" />
                    <span>{useRealUsers ? 'DB' : 'Mock'}</span>
                  </button>
                </div>
              </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 hover:bg-slate-700 rounded transition-colors"
                title="Minimize"
              >
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="p-1 hover:bg-slate-700 rounded transition-colors"
                title="Hide dev bar"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Current Profile */}
          <div className="mb-4 p-3 bg-slate-700/50 rounded-lg border border-slate-600/50">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full ${roleColors[currentProfile.role]} flex items-center justify-center`}>
                <CurrentRoleIcon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h4 className="text-white font-medium">
                    {currentProfile.firstName || 'Unknown'} {currentProfile.lastName || 'User'}
                  </h4>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${roleColors[currentProfile.role]}`}>
                    {currentProfile.role}
                  </span>
                  {useRealUsers && (
                    <span className="px-2 py-1 rounded-full text-xs bg-green-600 text-white">
                      Real User
                    </span>
                  )}
                </div>
                <p className="text-slate-400 text-sm">{currentProfile.email}</p>
                <p className="text-slate-500 text-xs">
                  {useRealUsers 
                    ? `Active: ${currentProfile.isActive}, Created: ${new Date(currentProfile.createdAt).toLocaleDateString()}` 
                    : 'Mock user for development testing'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Profile Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {profiles.map((profile) => {
              const Icon = roleIcons[profile.role];
              const isActive = currentProfile.id === profile.id;
              
              return (
                <button
                  key={profile.id}
                  onClick={() => switchToProfile(profile)}
                  className={`p-3 rounded-lg border transition-all duration-200 text-left transform hover:scale-105 ${
                    isActive
                      ? 'bg-slate-600/50 border-slate-500 ring-2 ring-blue-500/50 shadow-lg'
                      : 'bg-slate-700/30 border-slate-600/50 hover:bg-slate-600/40 hover:border-slate-500 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-full ${roleColors[profile.role]} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h5 className="text-white font-medium text-sm truncate">
                          {profile.firstName || 'Unknown'} {profile.lastName || 'User'}
                        </h5>
                        {isActive && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        )}
                        {useRealUsers && (
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full" title="Real user"></div>
                        )}
                      </div>
                      <p className="text-slate-400 text-xs truncate">{profile.email}</p>
                      <p className="text-slate-500 text-xs truncate">
                        {useRealUsers 
                          ? `Created: ${new Date(profile.createdAt).toLocaleDateString()}`
                          : 'Mock development user'
                        }
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="mt-4 pt-3 border-t border-slate-600/50">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">
                {useRealUsers 
                  ? `Real database users loaded (${profiles.length} users)` 
                  : 'Using mock users - authentication bypassed'
                }
                {usersError && (
                  <span className="text-red-400 ml-2">
                    • DB Error: {usersError.message}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                                 {useRealUsers && (
                   <>
                     <button
                       onClick={() => refetch()}
                       className="flex items-center space-x-1 px-2 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs text-white transition-colors"
                     >
                       <RefreshCw className="w-3 h-3" />
                       <span>Refresh Users</span>
                     </button>
                     {profiles.length <= 3 && (
                       <button
                         onClick={() => {
                           console.log('📝 Note: To add test users, run the seed script or use the admin panel');
                           alert('💡 Tip: Run "npm run seed" in the API to create test users, or create users through the admin panel!');
                         }}
                         className="flex items-center space-x-1 px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-xs text-white transition-colors"
                         title="Add test users to the database"
                       >
                         <User className="w-3 h-3" />
                         <span>Add Test Users</span>
                       </button>
                     )}
                   </>
                 )}
                <button
                  onClick={() => window.location.reload()}
                  className="flex items-center space-x-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reload App</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Show dev bar toggle when hidden
export function DevBottomBarToggle() {
  const [isVisible, setIsVisible] = useState(false);
  const isDev = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';
  
  if (!isDev) return null;

  return (
    <>
      {!isVisible && (
        <button
          onClick={() => setIsVisible(true)}
          className="fixed bottom-4 left-4 z-40 bg-slate-800/90 hover:bg-slate-700/90 text-white p-2 rounded-full shadow-lg border border-slate-600/50 backdrop-blur-sm transition-all"
          title="Show dev tools"
        >
          <Eye className="w-4 h-4" />
        </button>
      )}
      {isVisible && <DevBottomBar />}
    </>
  );
}
