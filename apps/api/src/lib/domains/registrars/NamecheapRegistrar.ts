import { EventEmitter } from 'events';

interface DomainContact {
  firstName: string;
  lastName: string;
  organization?: string;
  email: string;
  phone: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

interface DomainRegistrationParams {
  domainName: string;
  years: number;
  registrantContact: DomainContact;
  adminContact?: DomainContact;
  techContact?: DomainContact;
  billingContact?: DomainContact;
  nameservers?: string[];
  privacyEnabled?: boolean;
}

interface DomainRenewalParams {
  domainName: string;
  years: number;
}

interface DomainTransferParams {
  domainName: string;
  authCode: string;
  years?: number;
}

interface NameserverUpdateParams {
  domainName: string;
  nameservers: string[];
}

interface DomainRegistrarResult {
  success: boolean;
  data?: {
    domainId?: string;
    expiryDate?: string;
    nameservers?: string[];
    [key: string]: any;
  };
  error?: {
    code?: string;
    message: string;
    details?: any;
  };
}

interface NamecheapConfig {
  apiKey: string;
  username: string;
  sandbox?: boolean;
  clientIp?: string;
}

export class NamecheapRegistrar extends EventEmitter {
  private config: NamecheapConfig;
  private baseUrl: string;

  constructor(config: NamecheapConfig) {
    super();
    this.config = config;
    this.baseUrl = config.sandbox 
      ? 'https://api.sandbox.namecheap.com/xml.response'
      : 'https://api.namecheap.com/xml.response';
  }

  // Domain Registration
  async registerDomain(params: DomainRegistrationParams): Promise<DomainRegistrarResult> {
    try {
      console.log(`🌐 Registering domain with Namecheap: ${params.domainName}`);

      const requestParams = {
        Command: 'namecheap.domains.create',
        DomainName: params.domainName,
        Years: params.years.toString(),
        
        // Registrant contact
        RegistrantFirstName: params.registrantContact.firstName,
        RegistrantLastName: params.registrantContact.lastName,
        RegistrantOrganizationName: params.registrantContact.organization || '',
        RegistrantEmailAddress: params.registrantContact.email,
        RegistrantPhone: params.registrantContact.phone,
        RegistrantAddress1: params.registrantContact.address.line1,
        RegistrantAddress2: params.registrantContact.address.line2 || '',
        RegistrantCity: params.registrantContact.address.city,
        RegistrantStateProvince: params.registrantContact.address.state,
        RegistrantPostalCode: params.registrantContact.address.postalCode,
        RegistrantCountry: params.registrantContact.address.country,
        
        // Use registrant as default for other contacts if not provided
        AdminFirstName: params.adminContact?.firstName || params.registrantContact.firstName,
        AdminLastName: params.adminContact?.lastName || params.registrantContact.lastName,
        AdminOrganizationName: params.adminContact?.organization || params.registrantContact.organization || '',
        AdminEmailAddress: params.adminContact?.email || params.registrantContact.email,
        AdminPhone: params.adminContact?.phone || params.registrantContact.phone,
        AdminAddress1: params.adminContact?.address.line1 || params.registrantContact.address.line1,
        AdminAddress2: params.adminContact?.address.line2 || params.registrantContact.address.line2 || '',
        AdminCity: params.adminContact?.address.city || params.registrantContact.address.city,
        AdminStateProvince: params.adminContact?.address.state || params.registrantContact.address.state,
        AdminPostalCode: params.adminContact?.address.postalCode || params.registrantContact.address.postalCode,
        AdminCountry: params.adminContact?.address.country || params.registrantContact.address.country,
        
        TechFirstName: params.techContact?.firstName || params.registrantContact.firstName,
        TechLastName: params.techContact?.lastName || params.registrantContact.lastName,
        TechOrganizationName: params.techContact?.organization || params.registrantContact.organization || '',
        TechEmailAddress: params.techContact?.email || params.registrantContact.email,
        TechPhone: params.techContact?.phone || params.registrantContact.phone,
        TechAddress1: params.techContact?.address.line1 || params.registrantContact.address.line1,
        TechAddress2: params.techContact?.address.line2 || params.registrantContact.address.line2 || '',
        TechCity: params.techContact?.address.city || params.registrantContact.address.city,
        TechStateProvince: params.techContact?.address.state || params.registrantContact.address.state,
        TechPostalCode: params.techContact?.address.postalCode || params.registrantContact.address.postalCode,
        TechCountry: params.techContact?.address.country || params.registrantContact.address.country,
        
        // Nameservers
        ...(params.nameservers && params.nameservers.length > 0 && {
          Nameservers: params.nameservers.join(',')
        }),
        
        // Privacy protection
        AddFreeWhoisguard: params.privacyEnabled ? 'yes' : 'no',
        WGEnabled: params.privacyEnabled ? 'yes' : 'no',
      };

      const response = await this.makeApiCall(requestParams);
      
      if (response.success) {
        const data = {
          domainId: response.data.DomainID,
          expiryDate: response.data.ExpiryDate,
          nameservers: params.nameservers || [],
        };

        this.emit('domain.registered', { domainName: params.domainName, data });
        
        return {
          success: true,
          data,
        };
      } else {
        return {
          success: false,
          error: {
            code: 'REGISTRATION_FAILED',
            message: response.error?.message || 'Domain registration failed',
            details: response.error,
          },
        };
      }
    } catch (error) {
      console.error('Namecheap domain registration error:', error);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: error,
        },
      };
    }
  }

  // Domain Renewal
  async renewDomain(params: DomainRenewalParams): Promise<DomainRegistrarResult> {
    try {
      console.log(`🔄 Renewing domain with Namecheap: ${params.domainName}`);

      const requestParams = {
        Command: 'namecheap.domains.renew',
        DomainName: params.domainName,
        Years: params.years.toString(),
      };

      const response = await this.makeApiCall(requestParams);
      
      if (response.success) {
        const data = {
          domainId: response.data.DomainID,
          expiryDate: response.data.ExpiryDate,
        };

        this.emit('domain.renewed', { domainName: params.domainName, years: params.years });
        
        return {
          success: true,
          data,
        };
      } else {
        return {
          success: false,
          error: {
            code: 'RENEWAL_FAILED',
            message: response.error?.message || 'Domain renewal failed',
            details: response.error,
          },
        };
      }
    } catch (error) {
      console.error('Namecheap domain renewal error:', error);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: error,
        },
      };
    }
  }

  // Domain Transfer
  async transferDomain(params: DomainTransferParams): Promise<DomainRegistrarResult> {
    try {
      console.log(`📦 Transferring domain to Namecheap: ${params.domainName}`);

      const requestParams = {
        Command: 'namecheap.domains.transfer.create',
        DomainName: params.domainName,
        EPPCode: params.authCode,
        Years: (params.years || 1).toString(),
      };

      const response = await this.makeApiCall(requestParams);
      
      if (response.success) {
        const data = {
          transferId: response.data.TransferID,
          status: response.data.Status,
        };

        this.emit('domain.transfer.started', { domainName: params.domainName });
        
        return {
          success: true,
          data,
        };
      } else {
        return {
          success: false,
          error: {
            code: 'TRANSFER_FAILED',
            message: response.error?.message || 'Domain transfer failed',
            details: response.error,
          },
        };
      }
    } catch (error) {
      console.error('Namecheap domain transfer error:', error);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: error,
        },
      };
    }
  }

  // Update Nameservers
  async updateNameservers(params: NameserverUpdateParams): Promise<DomainRegistrarResult> {
    try {
      console.log(`🔧 Updating nameservers for domain: ${params.domainName}`);

      const requestParams = {
        Command: 'namecheap.domains.dns.setCustom',
        SLD: params.domainName.split('.')[0],
        TLD: params.domainName.split('.').slice(1).join('.'),
        Nameservers: params.nameservers.join(','),
      };

      const response = await this.makeApiCall(requestParams);
      
      if (response.success) {
        this.emit('nameservers.updated', { 
          domainName: params.domainName, 
          nameservers: params.nameservers 
        });
        
        return {
          success: true,
          data: {
            nameservers: params.nameservers,
          },
        };
      } else {
        return {
          success: false,
          error: {
            code: 'NAMESERVER_UPDATE_FAILED',
            message: response.error?.message || 'Nameserver update failed',
            details: response.error,
          },
        };
      }
    } catch (error) {
      console.error('Namecheap nameserver update error:', error);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: error,
        },
      };
    }
  }

  // Get Domain Info
  async getDomainInfo(domainName: string): Promise<DomainRegistrarResult> {
    try {
      const requestParams = {
        Command: 'namecheap.domains.getInfo',
        DomainName: domainName,
      };

      const response = await this.makeApiCall(requestParams);
      
      if (response.success) {
        return {
          success: true,
          data: response.data,
        };
      } else {
        return {
          success: false,
          error: {
            code: 'DOMAIN_INFO_FAILED',
            message: response.error?.message || 'Failed to get domain info',
            details: response.error,
          },
        };
      }
    } catch (error) {
      console.error('Namecheap get domain info error:', error);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: error,
        },
      };
    }
  }

  // Check Domain Availability
  async checkDomainAvailability(domainName: string): Promise<{ available: boolean; premium?: boolean; price?: number }> {
    try {
      const requestParams = {
        Command: 'namecheap.domains.check',
        DomainList: domainName,
      };

      const response = await this.makeApiCall(requestParams);
      
      if (response.success && response.data.DomainCheckResult) {
        const result = response.data.DomainCheckResult;
        return {
          available: result.Available === 'true',
          premium: result.IsPremiumName === 'true',
          price: result.PremiumRegistrationPrice ? parseFloat(result.PremiumRegistrationPrice) : undefined,
        };
      }

      return { available: false };
    } catch (error) {
      console.error('Namecheap domain availability check error:', error);
      return { available: false };
    }
  }

  // Private API call method
  private async makeApiCall(params: Record<string, string>): Promise<any> {
    try {
      const queryParams = new URLSearchParams({
        ApiUser: this.config.username,
        ApiKey: this.config.apiKey,
        UserName: this.config.username,
        ClientIp: this.config.clientIp || '127.0.0.1',
        ...params
      });

      const response = await fetch(`${this.baseUrl}?${queryParams.toString()}`);
      const xmlText = await response.text();

      // Parse XML response
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

      // Check for API errors
      const errors = xmlDoc.getElementsByTagName('Errors')[0];
      if (errors && errors.childNodes.length > 0) {
        const errorMessages = Array.from(errors.getElementsByTagName('Error'))
          .map(error => ({
            code: error.getAttribute('Number'),
            message: error.textContent
          }));

        return {
          success: false,
          error: {
            code: errorMessages[0].code,
            message: errorMessages[0].message,
            details: errorMessages
          }
        };
      }

      // Get command-specific response
      const commandType = params.Command.split('.')[1]; // e.g., 'domains' from 'namecheap.domains.create'
      const responseType = this.getResponseType(commandType);
      
      const responseElement = xmlDoc.getElementsByTagName(responseType)[0];
      if (!responseElement) {
        throw new Error(`Invalid response format: missing ${responseType} element`);
      }

      // Parse response based on command type
      const data = this.parseCommandResponse(responseElement, commandType);

      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('Namecheap API call error:', error);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: error
        }
      };
    }
  }

  private getResponseType(commandType: string): string {
    const responseTypes: Record<string, string> = {
      'domains': 'DomainCreateResult',
      'dns': 'DnsSetHostsResult',
      'transfer': 'TransferCreateResult',
      'getinfo': 'DomainGetInfoResult',
      'check': 'DomainCheckResult',
      'renew': 'DomainRenewResult'
    };

    return responseTypes[commandType] || 'CommandResponse';
  }

  private parseCommandResponse(element: Element, commandType: string): any {
    switch (commandType) {
      case 'domains':
        return this.parseDomainResponse(element);
      case 'dns':
        return this.parseDnsResponse(element);
      case 'transfer':
        return this.parseTransferResponse(element);
      case 'getinfo':
        return this.parseGetInfoResponse(element);
      case 'check':
        return this.parseCheckResponse(element);
      case 'renew':
        return this.parseRenewResponse(element);
      default:
        return this.parseGenericResponse(element);
    }
  }

  private parseDomainResponse(element: Element): any {
    return {
      DomainID: element.getAttribute('DomainID'),
      OrderID: element.getAttribute('OrderID'),
      TransactionID: element.getAttribute('TransactionID'),
      Registered: element.getAttribute('Registered') === 'true',
      ChargedAmount: element.getAttribute('ChargedAmount'),
      ExpiryDate: element.getAttribute('ExpiryDate'),
      WhoisguardEnabled: element.getAttribute('WhoisguardEnabled') === 'true'
    };
  }

  private parseDnsResponse(element: Element): any {
    const hosts = Array.from(element.getElementsByTagName('Host')).map(host => ({
      Name: host.getAttribute('Name'),
      Type: host.getAttribute('Type'),
      Address: host.getAttribute('Address'),
      MXPref: host.getAttribute('MXPref'),
      TTL: host.getAttribute('TTL')
    }));

    return {
      Domain: element.getAttribute('Domain'),
      IsSuccess: element.getAttribute('IsSuccess') === 'true',
      Hosts: hosts
    };
  }

  private parseTransferResponse(element: Element): any {
    return {
      TransferID: element.getAttribute('TransferID'),
      OrderID: element.getAttribute('OrderID'),
      TransactionID: element.getAttribute('TransactionID'),
      Status: element.getAttribute('Status'),
      StatusDescription: element.getAttribute('StatusDescription')
    };
  }

  private parseGetInfoResponse(element: Element): any {
    const registrant = element.getElementsByTagName('Registrant')[0];
    const nameservers = Array.from(element.getElementsByTagName('Nameserver'))
      .map(ns => ns.textContent);

    return {
      Status: element.getAttribute('Status'),
      DomainName: element.getAttribute('DomainName'),
      ExpiryDate: element.getAttribute('ExpiryDate'),
      CreatedDate: element.getAttribute('CreatedDate'),
      Registrant: registrant ? {
        FirstName: registrant.getAttribute('FirstName'),
        LastName: registrant.getAttribute('LastName'),
        Organization: registrant.getAttribute('Organization'),
        Email: registrant.getAttribute('EmailAddress'),
        Phone: registrant.getAttribute('Phone')
      } : null,
      Nameservers: nameservers,
      WhoisGuardEnabled: element.getAttribute('WhoisGuardEnabled') === 'true',
      PremiumDnsEnabled: element.getAttribute('PremiumDnsEnabled') === 'true',
      AutoRenewEnabled: element.getAttribute('AutoRenewEnabled') === 'true'
    };
  }

  private parseCheckResponse(element: Element): any {
    const domains = Array.from(element.getElementsByTagName('Domain')).map(domain => ({
      Name: domain.getAttribute('Domain'),
      Available: domain.getAttribute('Available') === 'true',
      IsPremium: domain.getAttribute('IsPremium') === 'true',
      PremiumRegistrationPrice: domain.getAttribute('PremiumRegistrationPrice'),
      PremiumRenewalPrice: domain.getAttribute('PremiumRenewalPrice')
    }));

    return {
      Domains: domains
    };
  }

  private parseRenewResponse(element: Element): any {
    return {
      DomainID: element.getAttribute('DomainID'),
      OrderID: element.getAttribute('OrderID'),
      TransactionID: element.getAttribute('TransactionID'),
      Renewed: element.getAttribute('Renewed') === 'true',
      ChargedAmount: element.getAttribute('ChargedAmount'),
      ExpiryDate: element.getAttribute('ExpiryDate'),
      OrderDetails: element.getAttribute('OrderDetails')
    };
  }

  private parseGenericResponse(element: Element): any {
    const result: Record<string, any> = {};
    
    // Get all attributes
    Array.from(element.attributes).forEach(attr => {
      result[attr.name] = attr.value;
    });

    // Get all child elements
    Array.from(element.children).forEach(child => {
      const key = child.tagName;
      if (child.children.length > 0) {
        result[key] = this.parseGenericResponse(child);
      } else {
        result[key] = child.textContent;
      }
    });

    return result;
  }

  // Health check
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      const testDomain = 'test-' + Math.random().toString(36).substring(7) + '.com';
      const availability = await this.checkDomainAvailability(testDomain);
      
      return {
        healthy: true,
        message: 'Namecheap API is responding',
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }
} 