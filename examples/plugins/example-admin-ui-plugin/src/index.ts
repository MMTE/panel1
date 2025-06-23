import React from 'react';
import {
  createPlugin,
  definePluginConfig,
  PluginContext,
  z,
} from '@panel1/plugin-sdk';

// Define configuration schema
const AdminUIConfigSchema = definePluginConfig(
  z.object({
    enabled: z.boolean().default(true),
    showHeaderWidget: z.boolean().default(true),
    showDashboardWidget: z.boolean().default(true),
    showSidebarLink: z.boolean().default(true),
    customMessage: z.string().default('Hello from Admin UI Plugin!'),
  })
);

// Header Widget Component
const HeaderWidget: React.FC<{ user?: any; isDemoMode?: boolean }> = ({ user, isDemoMode }) => {
  return React.createElement('div', {
    className: 'flex items-center space-x-2 px-3 py-1 bg-blue-100 rounded-lg border border-blue-200'
  }, [
    React.createElement('span', {
      key: 'icon',
      className: 'text-blue-600 text-sm'
    }, '🔌'),
    React.createElement('span', {
      key: 'text',
      className: 'text-blue-700 text-sm font-medium'
    }, 'Plugin Active')
  ]);
};

// Dashboard Widget Component
const DashboardWidget: React.FC<{ user?: any; isDemoMode?: boolean; stats?: any }> = ({ user, isDemoMode, stats }) => {
  return React.createElement('div', {
    className: 'bg-white rounded-xl shadow-sm border border-gray-200 p-6'
  }, [
    React.createElement('div', {
      key: 'header',
      className: 'flex items-center justify-between mb-4'
    }, [
      React.createElement('h3', {
        key: 'title',
        className: 'text-lg font-semibold text-gray-900'
      }, 'Plugin Dashboard Widget'),
      React.createElement('div', {
        key: 'icon',
        className: 'w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center'
      }, React.createElement('span', {
        className: 'text-white text-sm'
      }, '🔌'))
    ]),
    React.createElement('div', {
      key: 'content',
      className: 'space-y-3'
    }, [
      React.createElement('p', {
        key: 'message',
        className: 'text-gray-600'
      }, 'This widget is injected by the example admin UI plugin.'),
      React.createElement('div', {
        key: 'stats',
        className: 'grid grid-cols-2 gap-4'
      }, [
        React.createElement('div', {
          key: 'stat1',
          className: 'text-center p-3 bg-blue-50 rounded-lg'
        }, [
          React.createElement('div', {
            key: 'value',
            className: 'text-2xl font-bold text-blue-600'
          }, '42'),
          React.createElement('div', {
            key: 'label',
            className: 'text-sm text-blue-500'
          }, 'Plugin Events')
        ]),
        React.createElement('div', {
          key: 'stat2',
          className: 'text-center p-3 bg-green-50 rounded-lg'
        }, [
          React.createElement('div', {
            key: 'value',
            className: 'text-2xl font-bold text-green-600'
          }, '98%'),
          React.createElement('div', {
            key: 'label',
            className: 'text-sm text-green-500'
          }, 'Uptime')
        ])
      ]),
      isDemoMode && React.createElement('div', {
        key: 'demo-notice',
        className: 'mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg'
      }, React.createElement('p', {
        className: 'text-orange-700 text-sm'
      }, '🎭 This is demo data from the plugin'))
    ])
  ]);
};

// Sidebar Navigation Item Component
const SidebarNavItem: React.FC<{ user?: any; isDemoMode?: boolean; onNavigate?: () => void }> = ({ user, isDemoMode, onNavigate }) => {
  const handleClick = () => {
    if (onNavigate) onNavigate();
    // In a real implementation, this would navigate to the plugin page
    console.log('🔌 Plugin navigation clicked');
  };

  return React.createElement('button', {
    onClick: handleClick,
    className: 'flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-gray-700 hover:bg-gray-100 w-full text-left'
  }, [
    React.createElement('span', {
      key: 'icon',
      className: 'text-blue-500'
    }, '🔌'),
    React.createElement('span', {
      key: 'text',
      className: 'font-medium'
    }, 'Plugin Demo')
  ]);
};

// Quick Action Component
const QuickAction: React.FC<{ user?: any; isDemoMode?: boolean }> = ({ user, isDemoMode }) => {
  return React.createElement('button', {
    className: 'w-full flex items-center justify-center px-4 py-3 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors',
    onClick: () => alert('Plugin quick action triggered!')
  }, [
    React.createElement('span', {
      key: 'icon',
      className: 'mr-2'
    }, '🔌'),
    React.createElement('span', {
      key: 'text'
    }, 'Plugin Action')
  ]);
};

// User List Action Component
const UserListAction: React.FC<{ user?: any; isDemoMode?: boolean; users?: any[]; searchTerm?: string; selectedRole?: string }> = ({ user, isDemoMode, users, searchTerm, selectedRole }) => {
  return React.createElement('button', {
    className: 'flex items-center space-x-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors',
    onClick: () => console.log('🔌 Plugin user action:', { users: users?.length, searchTerm, selectedRole })
  }, [
    React.createElement('span', {
      key: 'icon'
    }, '🔌'),
    React.createElement('span', {
      key: 'text',
      className: 'text-sm font-medium'
    }, 'Plugin Export')
  ]);
};

// User List Footer Component
const UserListFooter: React.FC<{ user?: any; isDemoMode?: boolean; users?: any[]; total?: number }> = ({ user, isDemoMode, users, total }) => {
  return React.createElement('div', {
    className: 'flex items-center justify-between text-sm text-gray-500'
  }, [
    React.createElement('span', {
      key: 'info'
    }, `🔌 Plugin processed ${users?.length || 0} users`),
    React.createElement('button', {
      key: 'action',
      className: 'text-blue-600 hover:text-blue-700 font-medium',
      onClick: () => console.log('🔌 Plugin footer action')
    }, 'Plugin Action')
  ]);
};

// Create the plugin
const ExampleAdminUIPlugin = createPlugin({
  metadata: {
    name: 'example-admin-ui-plugin',
    version: '1.0.0',
    description: 'An example plugin demonstrating admin UI integration',
    author: 'Panel1 Team',
    panel1: '>=0.2.0',
  },
  configSchema: AdminUIConfigSchema,

  // Lifecycle methods
  async onInstall(ctx: PluginContext) {
    ctx.logger.info('Admin UI plugin installed');
    await ctx.createSettings({
      enabled: true,
      showHeaderWidget: true,
      showDashboardWidget: true,
      showSidebarLink: true,
      customMessage: 'Hello from Admin UI Plugin!',
    });
  },

  async onEnable(ctx: PluginContext) {
    ctx.logger.info('Admin UI plugin enabled');
    const config = await ctx.getPluginConfig<z.infer<typeof AdminUIConfigSchema>>(ctx.pluginId);
    
    if (config.enabled) {
      ctx.logger.info('Admin UI plugin is active and ready');
    }
  },

  async onDisable(ctx: PluginContext) {
    ctx.logger.info('Admin UI plugin disabled');
  },

  async onUninstall(ctx: PluginContext) {
    ctx.logger.info('Admin UI plugin uninstalled');
    await ctx.deleteSettings();
  },

  // Event hooks
  hooks: {
    'user.created': async ({ user, context }) => {
      context.logger.info(`🔌 Admin UI Plugin: New user created - ${user.email}`);
    },

    'user.loggedIn': async ({ user, context }) => {
      context.logger.info(`🔌 Admin UI Plugin: User logged in - ${user.email}`);
    },
  },

  // Custom API routes
  routes: {
    'GET /status': async (req, res, ctx) => {
      const config = await ctx.getPluginConfig<z.infer<typeof AdminUIConfigSchema>>(ctx.pluginId);
      
      return res.json({
        plugin: 'example-admin-ui-plugin',
        status: 'active',
        config,
        timestamp: new Date().toISOString(),
      });
    },

    'POST /action': async (req, res, ctx) => {
      const { action, data } = req.body;
      
      ctx.logger.info(`🔌 Admin UI Plugin: Action triggered - ${action}`, data);
      
      return res.json({
        success: true,
        action,
        data,
        timestamp: new Date().toISOString(),
      });
    },
  },

  // UI components for various slots
  components: {
    // Header slots
    'admin.header.left': () => HeaderWidget,
    
    // Dashboard slots
    'admin.dashboard.widgets': () => DashboardWidget,
    'admin.dashboard.quick.actions': () => QuickAction,
    
    // Navigation slots
    'admin.nav.sidebar': () => SidebarNavItem,
    
    // User management slots
    'admin.page.users.list.actions': () => UserListAction,
    'admin.page.users.list.footer': () => UserListFooter,
    
    // Example of a custom page route (would be handled by RouteManager)
    'admin.page.route.plugin-demo': () => React.createElement('div', {
      className: 'space-y-6'
    }, [
      React.createElement('div', {
        key: 'header'
      }, [
        React.createElement('h1', {
          key: 'title',
          className: 'text-3xl font-bold text-gray-900'
        }, '🔌 Plugin Demo Page'),
        React.createElement('p', {
          key: 'description',
          className: 'text-gray-600 mt-1'
        }, 'This page is provided by the example admin UI plugin.')
      ]),
      React.createElement('div', {
        key: 'content',
        className: 'bg-white rounded-xl shadow-sm border border-gray-200 p-6'
      }, [
        React.createElement('h2', {
          key: 'subtitle',
          className: 'text-xl font-semibold text-gray-900 mb-4'
        }, 'Plugin Features'),
        React.createElement('ul', {
          key: 'features',
          className: 'space-y-2 text-gray-600'
        }, [
          React.createElement('li', { key: 'f1' }, '✅ Header widget injection'),
          React.createElement('li', { key: 'f2' }, '✅ Dashboard widget injection'),
          React.createElement('li', { key: 'f3' }, '✅ Sidebar navigation injection'),
          React.createElement('li', { key: 'f4' }, '✅ User list action injection'),
          React.createElement('li', { key: 'f5' }, '✅ Custom page routes'),
          React.createElement('li', { key: 'f6' }, '✅ API route handling'),
          React.createElement('li', { key: 'f7' }, '✅ Event hook integration'),
        ])
      ])
    ])
  },
});

export default ExampleAdminUIPlugin;