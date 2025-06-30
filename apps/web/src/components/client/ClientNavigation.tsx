import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  FileText,
  CreditCard,
  Globe,
  Shield,
  MessageSquare,
  Settings,
} from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { useAuth } from '../../hooks/useAuth';

const navigation = [
  {
    id: 'overview',
    label: 'Overview',
    path: '/client',
    icon: Home,
    requiredPermission: 'client.read_own',
  },
  {
    id: 'invoices',
    label: 'Invoices',
    path: '/client/invoices',
    icon: FileText,
    requiredPermission: 'invoice.read_own',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    path: '/client/subscriptions',
    icon: CreditCard,
    requiredPermission: 'subscription.read_own',
  },
  {
    id: 'domains',
    label: 'Domains',
    path: '/client/domains',
    icon: Globe,
    requiredPermission: 'domain.read_own',
  },
  {
    id: 'ssl',
    label: 'SSL Certificates',
    path: '/client/ssl',
    icon: Shield,
    requiredPermission: 'ssl_certificate.read_own',
  },
  {
    id: 'support',
    label: 'Support',
    path: '/client/support',
    icon: MessageSquare,
    requiredPermission: 'support_ticket.read_own',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/client/settings',
    icon: Settings,
    requiredPermission: 'client.read_own',
  },
];

interface ClientNavigationProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function ClientNavigation({ isOpen = true, onClose }: ClientNavigationProps) {
  const location = useLocation();
  const { filteredNavigation } = useNavigation({ navigation });

  return (
    <aside className={`fixed top-0 left-0 z-40 w-64 h-screen transition-transform bg-white border-r border-gray-200 sm:translate-x-0 dark:bg-gray-800 dark:border-gray-700 ${
      isOpen ? 'translate-x-0' : '-translate-x-full'
    }`}>
      <div className="h-full px-3 py-4 overflow-y-auto bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center">
            <img src="/logo.svg" alt="Panel1" className="h-8 mr-3" />
            <span className="self-center text-xl font-semibold whitespace-nowrap dark:text-white">Panel1</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 inline-flex items-center dark:hover:bg-gray-600 dark:hover:text-white sm:hidden"
            >
              <span className="sr-only">Close menu</span>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
              </svg>
            </button>
          )}
        </div>
        <ul className="space-y-2 font-medium">
          {filteredNavigation.map((item) => (
            <li key={item.id}>
              <Link
                to={item.path}
                onClick={onClose}
                className={`flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 group ${
                  location.pathname === item.path ? 'bg-gray-100 dark:bg-gray-700' : ''
                }`}
              >
                <item.icon className="w-5 h-5 text-gray-500 transition duration-75 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white" />
                <span className="ml-3">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}