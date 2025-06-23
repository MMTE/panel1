// import { supabase } from '../supabase'; // TODO: Replace with tRPC

export interface MarketplacePlugin {
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  keywords: string[];
  downloads: number;
  rating: number;
  reviewCount: number;
  lastUpdated: string;
  verified: boolean;
  category: string;
  screenshots?: string[];
  readme?: string;
}

export interface PluginReview {
  id: string;
  pluginName: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: string;
  helpful: number;
}

/**
 * Manages plugin marketplace functionality
 */
export class MarketplaceManager {
  private static instance: MarketplaceManager;
  private pluginRegistry: MarketplacePlugin[] = [];

  private constructor() {}

  static getInstance(): MarketplaceManager {
    if (!MarketplaceManager.instance) {
      MarketplaceManager.instance = new MarketplaceManager();
    }
    return MarketplaceManager.instance;
  }

  /**
   * Fetch plugins from marketplace registry
   */
  async fetchPlugins(): Promise<MarketplacePlugin[]> {
    try {
      // In production, this would fetch from a remote registry
      // For now, we'll use a mock registry
      const mockPlugins: MarketplacePlugin[] = [
        {
          name: 'analytics-plugin',
          version: '1.3.0',
          description: 'Advanced analytics and reporting for Panel1',
          author: 'Panel1 Team',
          homepage: 'https://github.com/panel1-org/analytics-plugin',
          repository: 'https://github.com/panel1-org/analytics-plugin',
          keywords: ['analytics', 'reporting', 'dashboard'],
          downloads: 1250,
          rating: 4.8,
          reviewCount: 24,
          lastUpdated: '2024-01-15T10:30:00Z',
          verified: true,
          category: 'Analytics',
        },
        {
          name: 'stripe-enhanced',
          version: '2.1.0',
          description: 'Enhanced Stripe integration with advanced features',
          author: 'Community',
          repository: 'https://github.com/community/stripe-enhanced',
          keywords: ['stripe', 'payment', 'billing'],
          downloads: 890,
          rating: 4.6,
          reviewCount: 18,
          lastUpdated: '2024-01-10T14:20:00Z',
          verified: true,
          category: 'Payment',
        },
        {
          name: 'notification-center',
          version: '1.0.5',
          description: 'Centralized notification system with multiple channels',
          author: 'DevCorp',
          keywords: ['notifications', 'email', 'sms', 'slack'],
          downloads: 567,
          rating: 4.2,
          reviewCount: 12,
          lastUpdated: '2024-01-08T09:15:00Z',
          verified: false,
          category: 'Communication',
        },
      ];

      this.pluginRegistry = mockPlugins;
      return mockPlugins;
    } catch (error) {
      console.error('Failed to fetch plugins from marketplace:', error);
      return [];
    }
  }

  /**
   * Search plugins by query
   */
  searchPlugins(query: string, category?: string): MarketplacePlugin[] {
    const lowerQuery = query.toLowerCase();
    
    return this.pluginRegistry.filter(plugin => {
      const matchesQuery = 
        plugin.name.toLowerCase().includes(lowerQuery) ||
        plugin.description.toLowerCase().includes(lowerQuery) ||
        plugin.keywords.some(keyword => keyword.toLowerCase().includes(lowerQuery));
      
      const matchesCategory = !category || plugin.category === category;
      
      return matchesQuery && matchesCategory;
    });
  }

  /**
   * Get plugin details
   */
  async getPluginDetails(name: string): Promise<MarketplacePlugin | null> {
    const plugin = this.pluginRegistry.find(p => p.name === name);
    if (!plugin) return null;

    // In production, this would fetch additional details like README
    return {
      ...plugin,
      readme: `# ${plugin.name}\n\n${plugin.description}\n\n## Installation\n\n\`\`\`bash\npanel1 plugin install ${plugin.name}\n\`\`\``,
    };
  }

  /**
   * Get plugin reviews
   */
  async getPluginReviews(pluginName: string): Promise<PluginReview[]> {
    try {
      const { data, error } = await supabase
        .from('plugin_reviews')
        .select(`
          id,
          plugin_name,
          user_id,
          rating,
          comment,
          created_at,
          helpful,
          users!inner(first_name, last_name)
        `)
        .eq('plugin_name', pluginName)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data?.map(review => ({
        id: review.id,
        pluginName: review.plugin_name,
        userId: review.user_id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.created_at,
        helpful: review.helpful,
      })) || [];
    } catch (error) {
      console.error('Failed to fetch plugin reviews:', error);
      return [];
    }
  }

  /**
   * Submit plugin review
   */
  async submitReview(
    pluginName: string,
    rating: number,
    comment: string,
    userId: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('plugin_reviews')
        .insert({
          plugin_name: pluginName,
          user_id: userId,
          rating,
          comment,
          helpful: 0,
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to submit plugin review:', error);
      throw error;
    }
  }

  /**
   * Install plugin from marketplace
   */
  async installPlugin(pluginName: string): Promise<void> {
    const plugin = this.pluginRegistry.find(p => p.name === pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found in marketplace`);
    }

    try {
      // In production, this would download and install the plugin
      console.log(`Installing plugin ${pluginName} from marketplace...`);
      
      // Simulate installation process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update download count
      plugin.downloads += 1;
      
      console.log(`Plugin ${pluginName} installed successfully`);
    } catch (error) {
      console.error(`Failed to install plugin ${pluginName}:`, error);
      throw error;
    }
  }

  /**
   * Get plugin categories
   */
  getCategories(): string[] {
    const categories = new Set(this.pluginRegistry.map(p => p.category));
    return Array.from(categories).sort();
  }

  /**
   * Get featured plugins
   */
  getFeaturedPlugins(): MarketplacePlugin[] {
    return this.pluginRegistry
      .filter(p => p.verified && p.rating >= 4.5)
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 6);
  }

  /**
   * Get popular plugins
   */
  getPopularPlugins(): MarketplacePlugin[] {
    return this.pluginRegistry
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 10);
  }

  /**
   * Get recently updated plugins
   */
  getRecentlyUpdated(): MarketplacePlugin[] {
    return this.pluginRegistry
      .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
      .slice(0, 10);
  }
}

// Export singleton instance
export const marketplaceManager = MarketplaceManager.getInstance();