import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

interface LanguageSelectorProps {
  variant?: 'full' | 'minimal';
  placement?: 'bottom-left' | 'bottom-right';
}

export function LanguageSelector({ variant = 'full', placement = 'bottom-left' }: LanguageSelectorProps) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    // Add more languages as needed
  ];

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    setIsOpen(false);
  };

  const dropdownPosition = placement === 'bottom-right' ? 'right-0' : 'left-0';

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        {variant === 'full' ? (
          <>
            <Globe className="w-5 h-5 text-gray-600" />
            <span className="text-sm text-gray-700">{currentLanguage.name}</span>
          </>
        ) : (
          <Globe className="w-5 h-5 text-gray-600" />
        )}
      </button>

      {isOpen && (
        <div 
          className={`absolute ${dropdownPosition} mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50`}
        >
          <div className="py-2">
            {languages.map(language => (
              <button
                key={language.code}
                onClick={() => handleLanguageChange(language.code)}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <span className="mr-2">{language.flag}</span>
                <span>{language.name}</span>
                {language.code === currentLanguage.code && (
                  <span className="ml-auto text-purple-600">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 