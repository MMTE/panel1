import { 
  ProvisioningPlugin, 
  ProvisioningAdapter, 
  ProvisioningConfig 
} from '../types';
import { CpanelAdapter } from '../adapters/CpanelAdapter';

export class CpanelPlugin implements ProvisioningPlugin {
  name = 'cPanel/WHM Plugin';
  type = 'cpanel';
  version = '1.0.0';
  description = 'cPanel and WHM hosting control panel integration';

  async initialize(config: ProvisioningConfig): Promise<void> {
    console.log('🔌 Initializing cPanel plugin...');
    // Plugin initialization logic
  }

  async destroy(): Promise<void> {
    console.log('🔌 Destroying cPanel plugin...');
    // Cleanup logic
  }

  createAdapter(config: ProvisioningConfig): ProvisioningAdapter {
    return new CpanelAdapter(config);
  }

  getMetadata() {
    return {
      name: this.name,
      type: this.type,
      version: this.version,
      description: this.description,
      supportedOperations: [
        'provision',
        'suspend', 
        'unsuspend',
        'terminate',
        'modify',
        'backup',
        'restore'
      ],
      requiredConfig: [
        'hostname',
        'apiKey'
      ],
      optionalConfig: [
        'port',
        'username',
        'useSSL',
        'verifySSL',
        'timeout',
        'retries'
      ]
    };
  }
} 