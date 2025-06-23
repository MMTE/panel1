import React from 'react';
import {
  createPlugin,
  definePluginConfig,
  PluginContext,
  z,
  getPluginAssetUrl,
} from '@panel1/plugin-sdk';

// Define configuration schema
const AnalyticsConfigSchema = definePluginConfig(
  z.object({
    apiKey: z.string().min(1, "API Key is required"),
    enabled: z.boolean().default(true),
    trackPageViews: z.boolean().default(true),
    trackUserEvents: z.boolean().default(true),
    dashboardWidget: z.boolean().default(true),
  })
);

// Analytics service
class AnalyticsService {
  private apiKey: string;
  private enabled: boolean;

  constructor(apiKey: string, enabled: boolean) {
    this.apiKey = apiKey;
    this.enabled = enabled;
  }

  async trackEvent(event: string, data: any): Promise<void> {
    if (!this.enabled || !this.apiKey) return;

    try {
      await fetch('https://api.analytics-service.com/track', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event,
          data,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Failed to track analytics event:', error);
    }
  }

  async getMetrics(): Promise<any> {
    if (!this.enabled || !this.apiKey) return null;

    try {
      const response = await fetch('https://api.analytics-service.com/metrics', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch analytics metrics:', error);
      return null;
    }
  }
}

// Dashboard widget component
const AnalyticsDashboardWidget: React.FC<{ title?: string }> = ({ title = "Analytics" }) => {
  const [metrics, setMetrics] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // In a real implementation, this would get the analytics service instance
    // and fetch real metrics
    setTimeout(() => {
      setMetrics({
        pageViews: 1234,
        uniqueUsers: 567,
        events: 890,
        conversionRate: 3.2,
      });
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <img 
          src={getPluginAssetUrl('example-analytics-plugin', 'icon.svg')} 
          alt="Analytics" 
          className="w-6 h-6"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{metrics.pageViews}</div>
          <div className="text-sm text-gray-500">Page Views</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{metrics.uniqueUsers}</div>
          <div className="text-sm text-gray-500">Unique Users</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">{metrics.events}</div>
          <div className="text-sm text-gray-500">Events</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">{metrics.conversionRate}%</div>
          <div className="text-sm text-gray-500">Conversion</div>
        </div>
      </div>
    </div>
  );
};

// Sidebar navigation component
const AnalyticsNavItem: React.FC = () => {
  return (
    <a 
      href="/admin/analytics" 
      className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <img 
        src={getPluginAssetUrl('example-analytics-plugin', 'icon.svg')} 
        alt="Analytics" 
        className="w-5 h-5 mr-3"
      />
      Analytics
    </a>
  );
};

// Create the plugin
const ExampleAnalyticsPlugin = createPlugin({
  metadata: {
    name: 'example-analytics-plugin',
    version: '1.0.0',
    description: 'An example analytics plugin for Panel1',
    author: 'Panel1 Team',
    panel1: '>=0.2.0',
  },
  configSchema: AnalyticsConfigSchema,

  // Lifecycle methods
  async onInstall(ctx: PluginContext) {
    ctx.logger.info('Analytics plugin installed');
    await ctx.createSettings({
      apiKey: '',
      enabled: false,
      trackPageViews: true,
      trackUserEvents: true,
      dashboardWidget: true,
    });
  },

  async onEnable(ctx: PluginContext) {
    ctx.logger.info('Analytics plugin enabled');
    const config = await ctx.getPluginConfig<z.infer<typeof AnalyticsConfigSchema>>(ctx.pluginId);
    
    if (config.enabled && config.apiKey) {
      ctx.logger.info('Analytics tracking is active');
    } else {
      ctx.logger.warn('Analytics plugin enabled but not configured');
    }
  },

  async onDisable(ctx: PluginContext) {
    ctx.logger.info('Analytics plugin disabled');
  },

  async onUninstall(ctx: PluginContext) {
    ctx.logger.info('Analytics plugin uninstalled');
    await ctx.deleteSettings();
  },

  // Event hooks
  hooks: {
    'user.loggedIn': async ({ user, context }) => {
      const config = await context.getPluginConfig<z.infer<typeof AnalyticsConfigSchema>>(context.pluginId);
      
      if (config.enabled && config.trackUserEvents) {
        const analytics = new AnalyticsService(config.apiKey, config.enabled);
        await analytics.trackEvent('user_login', {
          userId: user.id,
          email: user.email,
          timestamp: new Date().toISOString(),
        });
        context.logger.info(`Tracked login event for user ${user.email}`);
      }
    },

    'invoice.paid': async ({ invoice, context }) => {
      const config = await context.getPluginConfig<z.infer<typeof AnalyticsConfigSchema>>(context.pluginId);
      
      if (config.enabled && config.trackUserEvents) {
        const analytics = new AnalyticsService(config.apiKey, config.enabled);
        await analytics.trackEvent('invoice_paid', {
          invoiceId: invoice.id,
          amount: invoice.total,
          currency: invoice.currency,
          timestamp: new Date().toISOString(),
        });
        context.logger.info(`Tracked payment event for invoice ${invoice.id}`);
      }
    },

    'client.created': async ({ client, context }) => {
      const config = await context.getPluginConfig<z.infer<typeof AnalyticsConfigSchema>>(context.pluginId);
      
      if (config.enabled && config.trackUserEvents) {
        const analytics = new AnalyticsService(config.apiKey, config.enabled);
        await analytics.trackEvent('client_created', {
          clientId: client.id,
          companyName: client.company_name,
          timestamp: new Date().toISOString(),
        });
        context.logger.info(`Tracked client creation event for ${client.company_name}`);
      }
    },
  },

  // Custom API routes
  routes: {
    'GET /metrics': async (req, res, ctx) => {
      const config = await ctx.getPluginConfig<z.infer<typeof AnalyticsConfigSchema>>(ctx.pluginId);
      
      if (!config.enabled || !config.apiKey) {
        return res.status(400).json({ error: 'Analytics not configured' });
      }

      const analytics = new AnalyticsService(config.apiKey, config.enabled);
      const metrics = await analytics.getMetrics();
      
      return res.json(metrics);
    },

    'POST /track': async (req, res, ctx) => {
      const config = await ctx.getPluginConfig<z.infer<typeof AnalyticsConfigSchema>>(ctx.pluginId);
      
      if (!config.enabled || !config.apiKey) {
        return res.status(400).json({ error: 'Analytics not configured' });
      }

      const { event, data } = req.body;
      
      if (!event) {
        return res.status(400).json({ error: 'Event name is required' });
      }

      const analytics = new AnalyticsService(config.apiKey, config.enabled);
      await analytics.trackEvent(event, data);
      
      ctx.logger.info(`Tracked custom event: ${event}`);
      return res.json({ success: true });
    },
  },

  // UI components
  components: {
    'admin.dashboard.widgets': () => <AnalyticsDashboardWidget />,
    'admin.nav.sidebar': () => <AnalyticsNavItem />,
    'client.dashboard.widgets': () => <AnalyticsDashboardWidget title="Your Analytics" />,
  },
});

export default ExampleAnalyticsPlugin;