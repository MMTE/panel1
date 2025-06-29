import React, { useEffect } from 'react';
import { useTenant } from '../hooks/useTenant';

export function TenantBranding() {
  const { tenant, getBranding } = useTenant();

  useEffect(() => {
    if (!tenant) return;

    const branding = getBranding();
    
    // Apply tenant branding to the document
    const root = document.documentElement;
    
    if (branding.primary_color) {
      root.style.setProperty('--color-primary', branding.primary_color);
    }
    
    if (branding.secondary_color) {
      root.style.setProperty('--color-secondary', branding.secondary_color);
    }

    // Update document title
    if (branding.company_name) {
      document.title = `${branding.company_name} - Panel1`;
    }

    // Update favicon if provided
    if (branding.favicon_url) {
      const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      if (favicon) {
        favicon.href = branding.favicon_url;
      }
    }

    // Inject custom CSS if provided
    if (branding.custom_css) {
      const existingStyle = document.getElementById('tenant-custom-css');
      if (existingStyle) {
        existingStyle.remove();
      }

      const style = document.createElement('style');
      style.id = 'tenant-custom-css';
      style.textContent = branding.custom_css;
      document.head.appendChild(style);
    }

    // Cleanup function
    return () => {
      const customStyle = document.getElementById('tenant-custom-css');
      if (customStyle) {
        customStyle.remove();
      }
    };
  }, [tenant, getBranding]);

  return null; // This component only applies styling, no visual output
}