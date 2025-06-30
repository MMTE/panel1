import React, { useState } from 'react';
import { Package, Copy, Star, Search, Filter } from 'lucide-react';

interface ComponentTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  icon: string;
  category: 'hosting' | 'domain' | 'ssl' | 'email' | 'database' | 'addon';
  popularity: number;
  tags: string[];
  template: {
    componentKey: string;
    name: string;
    description: string;
    type: string;
    provisioningRequired: boolean;
    provisioningProvider?: string;
    supportedPricingModels: string[];
    usageTrackingSupported: boolean;
    requiredConfigFields: string[];
    optionalConfigFields: string[];
    configFieldTypes: Record<string, string>;
    configFieldOptions: Record<string, any>;
    defaultConfiguration: Record<string, any>;
    tags: string[];
  };
}

interface ComponentTemplateLibraryProps {
  onSelectTemplate: (template: ComponentTemplate) => void;
  onClose: () => void;
}

export const ComponentTemplateLibrary: React.FC<ComponentTemplateLibraryProps> = ({
  onSelectTemplate,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'popularity' | 'name' | 'category'>('popularity');

  // Built-in component templates
  const templates: ComponentTemplate[] = [
    {
      id: 'cpanel-hosting',
      name: 'cPanel Hosting',
      description: 'Standard cPanel shared hosting with disk space, bandwidth, and email accounts',
      type: 'HOSTING',
      icon: '🖥️',
      category: 'hosting',
      popularity: 95,
      tags: ['cpanel', 'shared', 'linux', 'popular'],
      template: {
        componentKey: 'cpanel_hosting',
        name: 'cPanel Hosting',
        description: 'Standard cPanel shared hosting with disk space, bandwidth, and email accounts',
        type: 'HOSTING',
        provisioningRequired: true,
        provisioningProvider: 'cpanel',
        supportedPricingModels: ['FIXED', 'TIERED'],
        usageTrackingSupported: true,
        requiredConfigFields: ['domain', 'diskSpace', 'bandwidth'],
        optionalConfigFields: ['emailAccounts', 'databases', 'subdomains', 'ftpAccounts'],
        configFieldTypes: {
          domain: 'string',
          diskSpace: 'number',
          bandwidth: 'number',
          emailAccounts: 'number',
          databases: 'number',
          subdomains: 'number',
          ftpAccounts: 'number'
        },
        configFieldOptions: {},
        defaultConfiguration: {
          diskSpace: 10240,
          bandwidth: 100,
          emailAccounts: 10,
          databases: 5,
          subdomains: 10,
          ftpAccounts: 5
        },
        tags: ['cpanel', 'shared', 'linux']
      }
    },
    {
      id: 'domain-registration',
      name: 'Domain Registration',
      description: 'Domain name registration with privacy protection and DNS management',
      type: 'DOMAIN',
      icon: '🌐',
      category: 'domain',
      popularity: 90,
      tags: ['domain', 'registration', 'dns'],
      template: {
        componentKey: 'domain_registration',
        name: 'Domain Registration',
        description: 'Domain name registration with privacy protection and DNS management',
        type: 'DOMAIN',
        provisioningRequired: true,
        provisioningProvider: 'domain_registrar',
        supportedPricingModels: ['FIXED'],
        usageTrackingSupported: false,
        requiredConfigFields: ['domainName', 'registrationPeriod'],
        optionalConfigFields: ['privacyProtection', 'autoRenew', 'nameservers'],
        configFieldTypes: {
          domainName: 'string',
          registrationPeriod: 'number',
          privacyProtection: 'boolean',
          autoRenew: 'boolean',
          nameservers: 'array'
        },
        configFieldOptions: {},
        defaultConfiguration: {
          registrationPeriod: 1,
          privacyProtection: false,
          autoRenew: true
        },
        tags: ['domain', 'registration', 'dns']
      }
    },
    {
      id: 'ssl-certificate',
      name: 'SSL Certificate',
      description: 'SSL/TLS certificates for website security with auto-installation',
      type: 'SSL',
      icon: '🔒',
      category: 'ssl',
      popularity: 85,
      tags: ['ssl', 'security', 'https'],
      template: {
        componentKey: 'ssl_certificate',
        name: 'SSL Certificate',
        description: 'SSL/TLS certificates for website security with auto-installation',
        type: 'SSL',
        provisioningRequired: true,
        provisioningProvider: 'ssl_provider',
        supportedPricingModels: ['FIXED'],
        usageTrackingSupported: false,
        requiredConfigFields: ['domain', 'certificateType'],
        optionalConfigFields: ['validityPeriod', 'autoInstall', 'autoRenew'],
        configFieldTypes: {
          domain: 'string',
          certificateType: 'select',
          validityPeriod: 'number',
          autoInstall: 'boolean',
          autoRenew: 'boolean'
        },
        configFieldOptions: {
          certificateType: [
            { value: 'domain_validated', label: 'Domain Validated' },
            { value: 'organization_validated', label: 'Organization Validated' },
            { value: 'extended_validation', label: 'Extended Validation' }
          ]
        },
        defaultConfiguration: {
          certificateType: 'domain_validated',
          validityPeriod: 365,
          autoInstall: true,
          autoRenew: true
        },
        tags: ['ssl', 'security', 'https']
      }
    },
    {
      id: 'email-hosting',
      name: 'Email Hosting',
      description: 'Professional email hosting with IMAP/POP3 and webmail access',
      type: 'EMAIL',
      icon: '📧',
      category: 'email',
      popularity: 75,
      tags: ['email', 'imap', 'smtp'],
      template: {
        componentKey: 'email_hosting',
        name: 'Email Hosting',
        description: 'Professional email hosting with IMAP/POP3 and webmail access',
        type: 'EMAIL',
        provisioningRequired: true,
        provisioningProvider: 'email_provider',
        supportedPricingModels: ['PER_UNIT', 'TIERED'],
        usageTrackingSupported: true,
        requiredConfigFields: ['domain', 'mailboxes'],
        optionalConfigFields: ['storagePerMailbox', 'aliases', 'forwarders'],
        configFieldTypes: {
          domain: 'string',
          mailboxes: 'number',
          storagePerMailbox: 'number',
          aliases: 'number',
          forwarders: 'number'
        },
        configFieldOptions: {},
        defaultConfiguration: {
          mailboxes: 5,
          storagePerMailbox: 5120,
          aliases: 10,
          forwarders: 5
        },
        tags: ['email', 'imap', 'smtp']
      }
    },
    {
      id: 'mysql-database',
      name: 'MySQL Database',
      description: 'MySQL database hosting with phpMyAdmin access',
      type: 'DATABASE',
      icon: '🗄️',
      category: 'database',
      popularity: 70,
      tags: ['mysql', 'database', 'phpmyadmin'],
      template: {
        componentKey: 'mysql_database',
        name: 'MySQL Database',
        description: 'MySQL database hosting with phpMyAdmin access',
        type: 'DATABASE',
        provisioningRequired: true,
        provisioningProvider: 'database_provider',
        supportedPricingModels: ['FIXED', 'PER_UNIT'],
        usageTrackingSupported: true,
        requiredConfigFields: ['databaseName', 'username'],
        optionalConfigFields: ['maxConnections', 'storageLimit', 'backupEnabled'],
        configFieldTypes: {
          databaseName: 'string',
          username: 'string',
          maxConnections: 'number',
          storageLimit: 'number',
          backupEnabled: 'boolean'
        },
        configFieldOptions: {},
        defaultConfiguration: {
          maxConnections: 100,
          storageLimit: 1024,
          backupEnabled: true
        },
        tags: ['mysql', 'database', 'phpmyadmin']
      }
    },
    {
      id: 'cdn-service',
      name: 'CDN Service',
      description: 'Content Delivery Network for faster website loading',
      type: 'OTHER',
      icon: '🚀',
      category: 'addon',
      popularity: 60,
      tags: ['cdn', 'performance', 'speed'],
      template: {
        componentKey: 'cdn_service',
        name: 'CDN Service',
        description: 'Content Delivery Network for faster website loading',
        type: 'OTHER',
        provisioningRequired: true,
        provisioningProvider: 'cdn_provider',
        supportedPricingModels: ['USAGE_BASED', 'TIERED'],
        usageTrackingSupported: true,
        requiredConfigFields: ['domain'],
        optionalConfigFields: ['cachingRules', 'compressionEnabled', 'sslEnabled'],
        configFieldTypes: {
          domain: 'string',
          cachingRules: 'array',
          compressionEnabled: 'boolean',
          sslEnabled: 'boolean'
        },
        configFieldOptions: {},
        defaultConfiguration: {
          compressionEnabled: true,
          sslEnabled: true
        },
        tags: ['cdn', 'performance', 'speed']
      }
    }
  ];

  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'hosting', label: 'Hosting' },
    { value: 'domain', label: 'Domain' },
    { value: 'ssl', label: 'SSL' },
    { value: 'email', label: 'Email' },
    { value: 'database', label: 'Database' },
    { value: 'addon', label: 'Add-ons' }
  ];

  // Filter and sort templates
  const filteredTemplates = templates
    .filter(template => {
      const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'popularity':
          return b.popularity - a.popularity;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'category':
          return a.category.localeCompare(b.category);
        default:
          return 0;
      }
    });

  const getPopularityStars = (popularity: number) => {
    const stars = Math.floor(popularity / 20);
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-3 h-3 ${i < stars ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
      />
    ));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Component Templates</h3>
          <p className="text-sm text-gray-600">Choose from pre-built templates to quickly create components</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <Package className="w-5 h-5" />
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div className="flex gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {categories.map(category => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="popularity">Popularity</option>
            <option value="name">Name</option>
            <option value="category">Category</option>
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
            onClick={() => onSelectTemplate(template)}
          >
            {/* Template Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{template.icon}</div>
                <div>
                  <h4 className="font-medium text-gray-900">{template.name}</h4>
                  <p className="text-xs text-gray-500 capitalize">{template.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {getPopularityStars(template.popularity)}
              </div>
            </div>

            {/* Template Description */}
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {template.description}
            </p>

            {/* Template Details */}
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Pricing Models:</span>
                <span className="font-medium">{template.template.supportedPricingModels.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Config Fields:</span>
                <span className="font-medium">
                  {template.template.requiredConfigFields.length + template.template.optionalConfigFields.length}
                </span>
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1 mb-3">
              {template.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
              {template.tags.length > 3 && (
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                  +{template.tags.length - 3}
                </span>
              )}
            </div>

            {/* Use Template Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectTemplate(template);
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Use Template
            </button>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredTemplates.length === 0 && (
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
          <p className="text-gray-600">
            Try adjusting your search terms or filters
          </p>
        </div>
      )}

      {/* Template Count */}
      <div className="text-center text-sm text-gray-500">
        Showing {filteredTemplates.length} of {templates.length} templates
      </div>
    </div>
  );
}; 